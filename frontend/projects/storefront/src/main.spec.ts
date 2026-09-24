/**
 * Guards the one rule `src/main.ts` needs from the unit suite: no spec
 * may import it.
 *
 * `src/main.ts` is the composition root, so importing it boots the
 * application. Its module scope calls `void start()` (`src/main.ts:66`),
 * and because `@angular/build:unit-test` builds with the `build`
 * target's `development` configuration by default, `angular.json`'s
 * development `fileReplacements` make `environment.production` false
 * under `ng test`. `start()` therefore skips its production early
 * return and reaches `await import('./core/bootstrap-demo')`, which
 * statically imports `projects/shop-mocks/src/browser`, whose module scope calls
 * `setupWorker()` from `msw/browser`. Outside a real browser that call
 * throws `Invariant Violation: [MSW] Failed to execute setupWorker in
 * a non-browser environment`, the `import()` sits outside `start()`'s
 * own `try`, and `void` discards the rejected promise — so the run
 * reports an unhandled rejection that fails no test and is easy to
 * carry for months. `src/app/app.spec.ts` did exactly that with
 * `await import('../main')`.
 *
 * The invariant is a property of the spec tree rather than of any one
 * module, which is why this file scans the tree instead of asserting
 * on a subject. The fixtures below write `'../main'`, which from this
 * file's own directory (`src/`) resolves to the repository root and
 * not to the composition root, so the scan reads this file like any
 * other; a real import of the entry point from here would be written
 * `'./main'` and would be caught.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The `src/` tree, derived from the runner's working directory. */
const SRC_ROOT = resolve(process.cwd(), 'projects/storefront/src');

/** The repository root, which is where `angular.json` lives. */
const REPO_ROOT = process.cwd();

/** The module every source file imports, and the one `fileReplacements` swaps. */
const DEFAULT_ENVIRONMENT_MODULE = 'projects/storefront/src/environments/environment.ts';

/** `src/main.ts` without its extension — the shape `importsEntryPoint` compares against. */
const ENTRY_POINT = join(SRC_ROOT, 'main');

/** Every `*.spec.ts` file under `directory`, which is the set `ng test` collects. */
function collectSpecFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSpecFiles(child));
      continue;
    }
    if (entry.name.endsWith('.spec.ts')) found.push(child);
  }
  return found;
}

/**
 * Reports whether any module specifier in `source` resolves to the
 * composition root, covering both the static `from '...'` form and the
 * dynamic `import('...')` form that caused the original defect.
 *
 * A bare package specifier such as `@angular/core` resolves to a path
 * inside the importing file's own directory and can never equal
 * `ENTRY_POINT`, so it needs no arm of its own.
 */
function importsEntryPoint(specFile: string, source: string): boolean {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  const directory = dirname(specFile);
  const targets: string[] = [];
  let match = pattern.exec(source);
  while (match !== null) {
    targets.push(resolve(directory, match[1]).replace(/\.ts$/, ''));
    match = pattern.exec(source);
  }
  return targets.includes(ENTRY_POINT);
}

describe('T01: the unit suite does not boot the application', () => {
  it('recognises an entry-point import in both import forms', () => {
    const specFile = join(SRC_ROOT, 'app', 'app.spec.ts');
    // The second fixture is verbatim the line that produced the
    // unhandled rejection, so this case is the proof that the scan
    // below would have caught the defect it was written for.
    expect(importsEntryPoint(specFile, "import { start } from '../main';")).toBe(true);
    expect(importsEntryPoint(specFile, "const main = await import('../main');")).toBe(true);
    expect(importsEntryPoint(specFile, "const main = await import('../main.ts');")).toBe(true);
    expect(importsEntryPoint(specFile, "import { App } from './app';")).toBe(false);
    expect(importsEntryPoint(specFile, "import { TestBed } from '@angular/core/testing';")).toBe(
      false,
    );
  });

  it('scans a tree that holds the composition root and the specs', () => {
    // Without this case an empty or misresolved scan would make the
    // next one pass for saying nothing.
    const specFiles = collectSpecFiles(SRC_ROOT);
    expect(existsSync(`${ENTRY_POINT}.ts`)).toBe(true);
    expect(specFiles).toContain(join(SRC_ROOT, 'app', 'app.spec.ts'));
    expect(specFiles).toContain(join(SRC_ROOT, 'main.spec.ts'));
  });

  it('finds no spec under src/ that imports src/main.ts', () => {
    const offenders = collectSpecFiles(SRC_ROOT).filter((specFile) =>
      importsEntryPoint(specFile, readFileSync(specFile, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The two flags the MSW gates read. `src/main.ts:48` returns before
 * `startMocks()` when `production` is true, and `src/core/bootstrap-demo.ts`
 * returns early unless `demo` is true.
 */
interface EnvironmentFlags {
  readonly production: boolean;
  readonly demo: boolean;
}

/** One entry of an `ng build` configuration's `fileReplacements` array. */
interface FileReplacement {
  readonly replace: string;
  readonly with: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileReplacement(value: unknown): value is FileReplacement {
  return (
    isRecord(value) && typeof value['replace'] === 'string' && typeof value['with'] === 'string'
  );
}

/** One entry of a build target's `assets` array, in its object form. */
interface AssetPattern {
  readonly glob: string;
  readonly input: string;
  readonly ignore?: readonly string[];
}

function isAssetPattern(value: unknown): value is AssetPattern {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value['glob'] !== 'string' || typeof value['input'] !== 'string') {
    return false;
  }
  const ignore: unknown = value['ignore'];
  if (ignore === undefined) {
    return true;
  }
  return Array.isArray(ignore) && ignore.every((entry: unknown) => typeof entry === 'string');
}

/** Walks `angular.json` from the workspace root down the given key path. */
function readAngularJson(keys: readonly string[]): unknown {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'angular.json'), 'utf8'));
  let node: unknown = parsed;
  for (const key of keys) {
    node = isRecord(node) ? node[key] : undefined;
  }
  return node;
}

/** Reads an array node out of `angular.json` as `unknown` entries, or `[]` when it is absent. */
function readJsonArray(keys: readonly string[]): unknown[] {
  const node = readAngularJson(keys);
  if (!Array.isArray(node)) {
    return [];
  }
  const entries: unknown[] = [];
  for (const entry of node) {
    entries.push(entry);
  }
  return entries;
}

/** Reads an array node out of `angular.json`, keeping the entries `guard` accepts. */
function readEntries<T>(keys: readonly string[], guard: (value: unknown) => value is T): T[] {
  return readJsonArray(keys).filter(guard);
}

/** Reads the `fileReplacements` one project's `build` configuration declares. */
function readProjectReplacements(project: string, configuration: string): FileReplacement[] {
  return readEntries(
    [
      'projects',
      project,
      'architect',
      'build',
      'configurations',
      configuration,
      'fileReplacements',
    ],
    isFileReplacement,
  );
}

/**
 * Reads the `assets` a project's `build` target declares, or those of one
 * of its configurations: a configuration's own array replaces the target's
 * rather than extending it, so the two are read separately here.
 */
function readBuildAssets(project: string, configuration?: string): AssetPattern[] {
  const keys = ['projects', project, 'architect', 'build'];
  if (configuration === undefined) {
    // The target's own array lives under `options`; a named
    // configuration's sits directly under the configuration.
    keys.push('options');
  } else {
    keys.push('configurations', configuration);
  }
  keys.push('assets');
  return readEntries(keys, isAssetPattern);
}

/** Reads `fileReplacements` for one build configuration out of `angular.json`. */
function readFileReplacements(configuration: string): FileReplacement[] {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'angular.json'), 'utf8'));
  let node: unknown = parsed;
  for (const key of [
    'projects',
    'storefront',
    'architect',
    'build',
    'configurations',
    configuration,
    'fileReplacements',
  ]) {
    node = isRecord(node) ? node[key] : undefined;
  }
  return Array.isArray(node) ? node.filter(isFileReplacement) : [];
}

/** Reads one `serve` configuration out of `angular.json`, or `null` if absent. */
function readServeConfiguration(configuration: string): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'angular.json'), 'utf8'));
  let node: unknown = parsed;
  for (const key of [
    'projects',
    'storefront',
    'architect',
    'serve',
    'configurations',
    configuration,
  ]) {
    node = isRecord(node) ? node[key] : undefined;
  }
  return isRecord(node) ? node : null;
}

/**
 * The environment module `ng build --configuration <configuration>`
 * compiles. With no replacement declared the builder compiles the
 * default module, which is what makes the missing entry observable
 * here rather than silently passing.
 */
function environmentModuleFor(configuration: string): string {
  const entry = readFileReplacements(configuration).find(
    (replacement) => replacement.replace === DEFAULT_ENVIRONMENT_MODULE,
  );
  return entry === undefined ? DEFAULT_ENVIRONMENT_MODULE : entry.with;
}

/** Reads the three flags out of an environment module's object literal. */
function parseEnvironmentFlags(source: string): EnvironmentFlags {
  const literal = /export const environment[^=]*=\s*\{([^}]*)\}/.exec(source);
  if (literal === null) {
    throw new Error('no `export const environment` object literal in the environment module');
  }
  const body = literal[1];
  return {
    production: /\bproduction:\s*true\b/.test(body),
    demo: /\bdemo:\s*true\b/.test(body),
  };
}

describe('T28: the default build compiles the mock-only demo environment', () => {
  it('reads the flags out of an environment module', () => {
    // Without this case a parser that returned all-false would make
    // the production assertion below pass for the wrong reason.
    const source = [
      'export const environment: Environment = {',
      '  production: false,',
      '  demo: true,',
      '};',
    ].join('\n');
    expect(parseEnvironmentFlags(source)).toEqual({ production: false, demo: true });
    expect(() => parseEnvironmentFlags('export const other = 1;')).toThrow();
  });

  it('reads the replacement list out of angular.json', () => {
    // The fallback in `environmentModuleFor` hides a parse failure, so
    // a configuration that has always declared one is read first.
    expect(environmentModuleFor('development')).toBe(
      'projects/storefront/src/environments/environment.development.ts',
    );
    expect(existsSync(join(REPO_ROOT, environmentModuleFor('development')))).toBe(true);
  });

  it('the production artifact ships no mock worker; the development configuration starts it', () => {
    // The build artifact is wired to the real backend at the end of
    // the project, so only the development (and any e2e) configuration
    // starts the mock worker: production: true, demo: false in
    // environment.ts, production: false, demo: true in
    // environment.development.ts (the owner's rule, 2026-09-21).
    const productionModule = environmentModuleFor('production');
    const productionFlags = parseEnvironmentFlags(
      readFileSync(join(REPO_ROOT, productionModule), 'utf8'),
    );
    expect(productionFlags.production).toBe(true);
    expect(productionFlags.demo).toBe(false);

    const dev = parseEnvironmentFlags(
      readFileSync(join(REPO_ROOT, environmentModuleFor('development')), 'utf8'),
    );
    expect(dev.production).toBe(false);
    expect(dev.demo).toBe(true);
  });

  it('MIM-414: the production build swaps the worker module and drops the worker asset', () => {
    // The production dist is made MSW-free in two places: the module the
    // application reaches (`fileReplacements`) and the static asset the
    // browser registers (`assets.ignore`). `npm run check:storefront-dist`
    // proves the built artefact once it exists; these assertions hold the
    // configuration that artefact is built from, in `npm run test`.
    for (const project of ['storefront', 'demo-payment']) {
      const replacement = readProjectReplacements(project, 'production').find(
        (entry) => entry.replace === 'projects/shop-mocks/src/browser.ts',
      );
      expect(replacement?.with).toBe('projects/shop-mocks/src/browser.production.ts');
    }
    expect(existsSync(join(REPO_ROOT, 'projects/shop-mocks/src/browser.production.ts'))).toBe(true);

    const shopPublic = readBuildAssets('storefront').filter(
      (pattern) => pattern.input === 'projects/storefront/public',
    );
    expect(shopPublic.length).toBeGreaterThan(0);
    expect(
      shopPublic.every((pattern) => (pattern.ignore ?? []).includes('mockServiceWorker.js')),
    ).toBe(true);

    // The dev server, the e2e build and `npm run start:payment` all serve the
    // worker, so neither development configuration may inherit that exclusion.
    const shopDevKeepsWorker = readBuildAssets('storefront', 'development').some(
      (pattern) => pattern.glob === '**/*' && (pattern.ignore ?? []).length === 0,
    );
    expect(shopDevKeepsWorker).toBe(true);

    const paymentWorkerAssets = readBuildAssets('demo-payment').filter((pattern) =>
      pattern.glob.includes('mockServiceWorker'),
    );
    expect(paymentWorkerAssets).toEqual([]);
    const paymentDevKeepsWorker = readBuildAssets('demo-payment', 'development').some((pattern) =>
      pattern.glob.includes('mockServiceWorker'),
    );
    expect(paymentDevKeepsWorker).toBe(true);
  });

  it('the local-backend configuration compiles a mock-free development build (MIM-214)', () => {
    // The frontend on the real local backend: no optimisation, no mock
    // worker; `npm start` stays on the mock (the owner's rule, 2026-09-22).
    const module = environmentModuleFor('local-backend');
    expect(module).toBe('projects/storefront/src/environments/environment.local-backend.ts');
    expect(existsSync(join(REPO_ROOT, module))).toBe(true);
    const flags = parseEnvironmentFlags(readFileSync(join(REPO_ROOT, module), 'utf8'));
    expect(flags.production).toBe(false);
    expect(flags.demo).toBe(false);
    const serve = readServeConfiguration('local-backend');
    expect(serve?.['buildTarget']).toBe('storefront:build:local-backend');
    expect(serve?.['proxyConfig']).toBe('proxy.local-backend.conf.json');
    expect(existsSync(join(REPO_ROOT, 'proxy.local-backend.conf.json'))).toBe(true);
  });

  it('the demo-payment dev server proxies /api to the local backend (MIM-251)', () => {
    // The payment app runs on its own origin (4210); on the real backend its
    // API calls hit that origin, so the dev server has to forward them.
    // Naming the file is not the same as wiring it: a copy of `proxy.conf.json`
    // (which targets the shop's dev server on 4210) would still satisfy the
    // string check below, so the test reads the proxy file and asserts the
    // mapping itself.
    const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'angular.json'), 'utf8'));
    let optionsNode: unknown = parsed;
    for (const key of ['projects', 'demo-payment', 'architect', 'serve', 'options']) {
      optionsNode = isRecord(optionsNode) ? optionsNode[key] : undefined;
    }
    expect(isRecord(optionsNode) ? optionsNode['proxyConfig'] : undefined).toBe(
      'proxy.payment.conf.json',
    );
    expect(existsSync(join(REPO_ROOT, 'proxy.payment.conf.json'))).toBe(true);

    // The default serve configuration must resolve to the same proxy file;
    // an override on `serve.configurations.<defaultConfiguration>.proxyConfig`
    // would win at runtime even when `options.proxyConfig` still names the
    // intended file.
    let defaultNode: unknown = parsed;
    for (const key of ['projects', 'demo-payment', 'architect', 'serve', 'defaultConfiguration']) {
      defaultNode = isRecord(defaultNode) ? defaultNode[key] : undefined;
    }
    const defaultConfiguration = typeof defaultNode === 'string' ? defaultNode : '';
    expect(defaultConfiguration).toBe('development');
    let devNode: unknown = parsed;
    for (const key of [
      'projects',
      'demo-payment',
      'architect',
      'serve',
      'configurations',
      'development',
      'proxyConfig',
    ]) {
      devNode = isRecord(devNode) ? devNode[key] : undefined;
    }
    const effectiveProxyConfig =
      typeof devNode === 'string'
        ? devNode
        : isRecord(optionsNode)
          ? optionsNode['proxyConfig']
          : undefined;
    expect(effectiveProxyConfig).toBe('proxy.payment.conf.json');

    // The proxy file must route `/api` to the Spring backend on 8080.
    const proxy: unknown = JSON.parse(
      readFileSync(join(REPO_ROOT, 'proxy.payment.conf.json'), 'utf8'),
    );
    const apiEntry = isRecord(proxy) ? proxy['/api'] : undefined;
    expect(isRecord(apiEntry) ? apiEntry['target'] : undefined).toBe('http://localhost:8080');
  });
});
