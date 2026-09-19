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
 * statically imports `../mocks/browser`, whose module scope calls
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
const SRC_ROOT = resolve(process.cwd(), 'src');

/** The repository root, which is where `angular.json` lives. */
const REPO_ROOT = resolve(SRC_ROOT, '..');

/** The module every source file imports, and the one `fileReplacements` swaps. */
const DEFAULT_ENVIRONMENT_MODULE = 'src/environments/environment.ts';

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
 * The three flags the MSW gates read. `src/main.ts:48` returns before
 * `prepareMocks()` when `production` is true, and both
 * `src/core/bootstrap-demo.ts` and `startMockWorker` in
 * `src/mocks/browser.ts` return early unless `demo` or `e2e` is true.
 */
interface EnvironmentFlags {
  readonly production: boolean;
  readonly demo: boolean;
  readonly e2e: boolean;
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

/** Reads `fileReplacements` for one build configuration out of `angular.json`. */
function readFileReplacements(configuration: string): FileReplacement[] {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'angular.json'), 'utf8'));
  let node: unknown = parsed;
  for (const key of [
    'projects',
    'mi-bolt',
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
    e2e: /\be2e:\s*true\b/.test(body),
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
      '  e2e: false,',
      '};',
    ].join('\n');
    expect(parseEnvironmentFlags(source)).toEqual({ production: false, demo: true, e2e: false });
    expect(() => parseEnvironmentFlags('export const other = 1;')).toThrow();
  });

  it('reads the replacement list out of angular.json', () => {
    // The fallback in `environmentModuleFor` hides a parse failure, so
    // a configuration that has always declared one is read first.
    expect(environmentModuleFor('development')).toBe('src/environments/environment.development.ts');
    expect(environmentModuleFor('e2e')).toBe('src/environments/environment.e2e.ts');
    expect(existsSync(join(REPO_ROOT, environmentModuleFor('development')))).toBe(true);
  });

  it('starts the mock worker in the artifact `npm run build` produces', () => {
    // `docs/spec/testing.md:128` calls that artifact the "optimized
    // mock-only static artifact" and `docs/fix/FIX-47.md:107` records
    // that `npm run build` is it. MSW is the only data layer in the
    // repository, so an artifact whose flags close these gates renders
    // an error state on every data-driven screen.
    const module = environmentModuleFor('production');
    const flags = parseEnvironmentFlags(readFileSync(join(REPO_ROOT, module), 'utf8'));
    expect(flags.production).toBe(false);
    expect(flags.demo || flags.e2e).toBe(true);
  });
});
