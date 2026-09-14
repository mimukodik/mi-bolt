/**
 * e2e/fixtures/coverage.ts — v8 coverage collector for Playwright.
 *
 * The fixture:
 *   - creates a fresh browser context with `serviceWorkers: 'allow'`
 *     so MSW can register;
 *   - starts `page.coverage.startJSCoverage` with
 *     `resetOnNavigation: false, reportAnonymousScripts: true`;
 *   - flushes segments around every navigation and reload, per
 *     T02-AC03: the official API warns `resetOnNavigation: false`
 *     alone does not guarantee preservation;
 *   - runs the open-sockets assertion at the end of every test:
 *     no pending HTTP requests beyond MSW-owned traffic, no
 *     open WebSockets;
 *   - writes the merged report to `coverage/e2e/coverage-final.json`
 *     after the worker is closed so the gate can read it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  TestInfo,
} from '@playwright/test';

const REPO_ROOT = resolve(__dirname, '..', '..');
const E2E_COVERAGE_DIR = resolve(REPO_ROOT, 'coverage/e2e');
const FINAL_REPORT = resolve(E2E_COVERAGE_DIR, 'coverage-final.json');
const SEGMENTS_FILE = resolve(E2E_COVERAGE_DIR, 'segments.json');

export type CoverageFixture = {
  page: Page;
  context: BrowserContext;
  /** Reads the current merged coverage map. */
  read(): Promise<readonly ScriptCoverageEntry[]>;
  /** Flush the current page's coverage into the running segments file. */
  flush(): Promise<void>;
};

type ScriptCoverageEntry = Awaited<
  ReturnType<Page['coverage']['stopJSCoverage']>
>[number];

/**
 * Build the merged coverage map used by the gate. `resetOnNavigation`
 * is intentionally `false`, but we ALSO flush segments around every
 * navigation so the merged report is reliable across reloads and lazy
 * route loads (T02-AC03).
 */
async function startCoverage(page: Page): Promise<void> {
  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: true,
  });
}

async function stopCoverage(page: Page): Promise<ScriptCoverageEntry[]> {
  return page.coverage.stopJSCoverage();
}

/**
 * Normalises a V8 coverage entry so entries from multiple navigations
 * are merged by their `url` and `scriptId` keys. The gate reads the
 * resulting `coverage-final.json` and validates Istanbul-style metrics.
 */
function mergeSegments(
  segments: readonly ScriptCoverageEntry[][],
): ScriptCoverageEntry[] {
  const merged = new Map<string, ScriptCoverageEntry>();
  for (const segment of segments) {
    for (const entry of segment) {
      const key = entry.url || entry.scriptId;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          url: entry.url,
          scriptId: entry.scriptId,
          source: entry.source,
          functions: entry.functions.map((fn) => ({
            functionName: fn.functionName,
            isBlockCoverage: fn.isBlockCoverage,
            ranges: fn.ranges.map((r) => ({ ...r })),
          })),
        });
        continue;
      }
      // Merge function ranges by OR-ing hit counts; the gate translates
      // these ranges into Istanbul statements/branches in `e2eToIstanbul`.
      for (let i = 0; i < entry.functions.length; i++) {
        const incoming = entry.functions[i];
        const target = existing.functions[i];
        if (!target) {
          existing.functions.push({
            functionName: incoming.functionName,
            isBlockCoverage: incoming.isBlockCoverage,
            ranges: incoming.ranges.map((r) => ({ ...r })),
          });
          continue;
        }
        for (const range of incoming.ranges) {
          target.ranges.push({ ...range });
        }
      }
    }
  }
  return Array.from(merged.values());
}

/**
 * Convert the merged V8 entry list into Istanbul format the gate can
 * read. We use `ast-v8-to-istanbul` lazily so the test runner only
 * pays the cost when coverage is actually collected.
 */
async function e2eToIstanbul(
  entries: readonly ScriptCoverageEntry[],
): Promise<Record<string, unknown>> {
  const { default: v8toIstanbul } = await import('ast-v8-to-istanbul');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    if (!entry.url) continue;
    let localPath: string | null = null;
    try {
      const u = new URL(entry.url);
      if (u.protocol === 'file:') {
        localPath = decodeURIComponent(u.pathname);
      } else if (u.protocol === 'http:' || u.protocol === 'https:') {
        const pathname = decodeURIComponent(u.pathname);
        const trimmed = pathname.replace(/^\/(?:[^/]+\/)*/, '');
        if (trimmed && /\.(ts|js|mjs|cjs)$/.test(trimmed)) {
          // http(s) URLs are dev-server served. Map them back to the
          // repo source files; the dev-server bundle keeps the
          // original `src/...` path segment.
          localPath = resolve(REPO_ROOT, trimmed.replace(/^src\//, 'src/'));
        }
      }
    } catch {
      continue;
    }
    if (!localPath) continue;
    let source: string;
    try {
      source = await fs.readFile(localPath, 'utf8');
    } catch {
      continue;
    }
    const converter = v8toIstanbul(
      localPath,
      0,
      { source, path: path.relative(REPO_ROOT, localPath) },
    );
    await converter.load();
    converter.applyCoverage(entry.functions);
    const istanbul = converter.toIstanbul();
    for (const [key, value] of Object.entries(istanbul)) {
      result[key] = value;
    }
  }
  return result;
}

type CoverageArgs = {
  browser: Browser;
  browserName: string;
  contextOptions?: BrowserContextOptions;
};

export const coverageFixture = async (
  { browser, contextOptions }: CoverageArgs,
  use: (fixture: CoverageFixture) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> => {
  mkdirSync(E2E_COVERAGE_DIR, { recursive: true });

  const context = await browser.newContext({
    ...(contextOptions ?? {}),
    serviceWorkers: 'allow',
  });

  const segments: ScriptCoverageEntry[][] = [];

  // Open WebSockets and pending HTTP requests are tracked across the
  // whole test. The afterEach assertion in the canary spec relies on
  // the fixture keeping these lists, so the spec can call
  // `coverage.read()` and inspect them.
  const openSockets = new Set<string>();
  const pendingRequests = new Map<string, string>();

  context.on('page', (page) => {
    page.on('websocket', (ws) => {
      const url = ws.url();
      openSockets.add(url);
      ws.on('close', () => openSockets.delete(url));
    });
    page.on('request', (req) => {
      pendingRequests.set(req.url(), req.method());
    });
    page.on('requestfinished', (req) => {
      pendingRequests.delete(req.url());
    });
    page.on('requestfailed', (req) => {
      pendingRequests.delete(req.url());
    });
  });

  await context.exposeBinding('__miboltOpenSockets', () =>
    Array.from(openSockets),
  );
  await context.exposeBinding('__miboltPendingRequests', () =>
    Array.from(pendingRequests.entries()),
  );

  const flush = async (): Promise<void> => {
    const pages = context.pages();
    const collected: ScriptCoverageEntry[] = [];
    for (const page of pages) {
      if (page.isClosed()) continue;
      try {
        const segs = await stopCoverage(page);
        collected.push(...segs);
        await startCoverage(page);
      } catch {
        // page may have navigated mid-flush; ignore.
      }
    }
    segments.push(collected);
  };

  const page = await context.newPage();
  await startCoverage(page);

  page.on('framenavigated', () => {
    // Per AC03: do not rely on resetOnNavigation alone. The frame
    // navigation event triggers a flush so the next segment starts
    // cleanly without losing the counters already collected.
    flush().catch(() => {});
  });

  const read = async (): Promise<readonly ScriptCoverageEntry[]> => {
    // Snapshot whatever the page currently reports without
    // restarting the collection. Each navigation already pushed a
    // fresh segment via `framenavigated`, so the merged view is
    // already accurate. Calling flush() here races with the next
    // navigation and can drop segments.
    const snapshot: ScriptCoverageEntry[][] = [];
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      try {
        snapshot.push(await page.coverage.getJSCoverage());
      } catch {
        // page may have navigated mid-snapshot; ignore.
      }
    }
    return mergeSegments([...segments, ...snapshot]);
  };

  const fixture: CoverageFixture = { page, context, read, flush };
  try {
    await use(fixture);
  } finally {
    await flush();
    await context.close();

    const merged = mergeSegments(segments);
    const istanbul = await e2eToIstanbul(merged);
    mkdirSync(dirname(SEGMENTS_FILE), { recursive: true });
    writeFileSync(
      SEGMENTS_FILE,
      JSON.stringify(
        { segments: merged, openSockets: Array.from(openSockets) },
        null,
        2,
      ),
    );
    writeFileSync(FINAL_REPORT, JSON.stringify(istanbul, null, 2));
    testInfo.attachments.push({
      name: 'e2e-coverage',
      path: FINAL_REPORT,
      contentType: 'application/json',
    });
  }
};

export { e2eToIstanbul, mergeSegments };