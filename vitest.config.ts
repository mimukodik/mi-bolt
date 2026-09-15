// vitest.config.ts — vitest workspace configuration.
//
// Runs the contract and canary specs under tests/**. The
// `@angular/build:unit-test` builder picks this file up via
// `runnerConfig` (see angular.json) and merges its own coverage
// options on top of the ones declared here.
//
// Coverage contract:
//   - provider: v8           (native V8 counters via @vitest/coverage-v8)
//   - include: src/**/*.ts   (denominator is the runtime manifest's
//                             runtime|bootstrap files; the manifest
//                             script generates the same set)
//   - exclude: generated/test/d.ts files
//   - all: true              (include unvisited files in the report;
//                             the gate rejects them)
//   - reporter: json-summary, json — the gate reads coverage-final.json

import ts from 'typescript';
import { defineConfig, type PluginOption } from 'vitest/config';

/**
 * Vite 8 / Rolldown switched the SSR transform pipeline to oxc
 * (https://github.com/vitejs/vite/discussions/21891). oxc does NOT
 * downgrade TC39 stage-3 decorators into the legacy form that
 * TypeScript's `experimentalDecorators` flag produces, so the SSR
 * output for any file that uses `@Component` / `@Injectable`
 * decorators ends up as `@(SomeImport())({...}) class Foo {}`,
 * which Node 22+ refuses to parse and yields "Invalid or unexpected
 * token" before any test runs.
 *
 * This plugin runs before vite's `vite:oxc` plugin (`enforce: 'pre'`)
 * and lowers every TS source file into the classic
 * `__decorateClass([...], class {})` form with the Reflect metadata
 * Angular's JIT injector needs at runtime. esbuild supports the
 * `experimentalDecorators` transform but does NOT emit
 * `__metadata("design:paramtypes", [...])` calls
 * (https://github.com/evanw/esbuild/issues/2603), so the SDK's
 * `Api` class — which uses `constructor(private config:
 * ApiConfiguration, private http: HttpClient)` — would lose its
 * paramtypes and Angular would throw NG0202 ("constructor is not
 * compatible with Angular Dependency Injection"). TypeScript's
 * transpile module with `emitDecoratorMetadata: true` produces
 * both halves; the result is plain JS that oxc can parse.
 *
 * The plugin is a no-op for non-TS inputs and only registers
 * compiler options that mirror the project's `tsconfig.json`,
 * so other transforms (jsdom env, the rolldown pipeline in build,
 * etc.) are unaffected.
 *
 * ---
 *
 * JIT signal-input shim (Angular 22 + `input()` / `output()` /
 * `@ViewChild` / `@ContentChild`):
 *
 * The TS lowering above preserves `@Component({...})` decorators
 * but does NOT emit the `setClassMetadata(...)` calls that Angular's
 * AOT compiler would otherwise produce. Angular 22's JIT compiler
 * reads `Class.propDecorators` to learn which class fields are
 * inputs, outputs and view/content queries. Without those entries:
 *
 * - `input()` / `output()` / `input.required()` calls look like
 *   ordinary field initializers in the lowered JS and are
 *   invisible to JIT, so templates that bind to them fail with
 *   NG0303.
 * - `@ViewChild('body', { static: true })` populates
 *   `__prop__metadata__` via `__decorate`, but the JIT compiler
 *   reads `propDecorators` (the field set by `setClassMetadata`)
 *   FIRST and short-circuits before falling back to
 *   `__prop__metadata__`. View queries therefore stay empty and
 *   `this.body` stays `undefined` even when the template has a
 *   matching `<ng-template #body>`.
 *
 * To keep these features working under vitest without dragging in
 * `@angular/compiler-cli`'s linker, this plugin scans the original
 * TS source for classes decorated with `@Component` or
 * `@Directive`. For each class it collects:
 *
 *   - field initializers that call `input()` / `input.required()`
 *     / `output()` / `model()`;
 *   - property decorators `@ViewChild` / `@ViewChildren` /
 *     `@ContentChild` / `@ContentChildren`.
 *
 * After the TS lowering (which always ends a decorated class with
 * `MobileDrawer = __decorate([Component({...})], MobileDrawer)`)
 * the plugin appends a `ɵsetClassMetadata(...)` call at the END
 * of the file. The `propDecorators` written there land on the
 * decorated class binding the JIT compiler resolves later, so the
 * inputs/outputs/queries are visible when the component is
 * instantiated.
 */
const tsLegacyDecoratorsPlugin = (): PluginOption => ({
  name: 'mi-bolt:ts-legacy-decorators',
  enforce: 'pre',
  transform(code, id) {
    // Only `.ts` source files need the decorator lowering; `.tsx` would
    // require a JSX-aware compiler and we have none in this workspace.
    // `node_modules` is left to the rolldown/oxc pipeline.
    if (!id.endsWith('.ts') || id.endsWith('.d.ts') || id.includes('node_modules')) {
      return null;
    }

    // First pass: scan the original TS source for components/directives
    // whose fields use signal-based input/output/model declarations.
    const sourceFile = ts.createSourceFile(
      id,
      code,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );

    interface DetectedClass {
      readonly name: string;
      readonly inputs: readonly { name: string; required: boolean }[];
      readonly outputs: readonly { name: string }[];
      readonly viewQueries: readonly {
        name: string;
        selector: string;
        isFirst: boolean;
        isStatic: boolean;
        descendants: boolean;
      }[];
      readonly contentQueries: readonly {
        name: string;
        selector: string;
        isFirst: boolean;
        isStatic: boolean;
        descendants: boolean;
      }[];
    }

    const detectedClasses: DetectedClass[] = [];

    const collectMembersMetadata = (
      classNode: ts.ClassDeclaration,
    ): {
      inputs: DetectedClass['inputs'];
      outputs: DetectedClass['outputs'];
      viewQueries: DetectedClass['viewQueries'];
      contentQueries: DetectedClass['contentQueries'];
    } => {
      const inputs: DetectedClass['inputs'] = [];
      const outputs: DetectedClass['outputs'] = [];
      const viewQueries: DetectedClass['viewQueries'] = [];
      const contentQueries: DetectedClass['contentQueries'] = [];

      // Walk class members and collect signal-based inputs/outputs from
      // field initializers AND decorator-based queries from
      // `@ViewChild`/`@ContentChild` annotations. The latter are the
      // JIT-friendly view-query API; without this entry the JIT
      // compiler builds a component with no viewQueries at all and
      // `body` stays `undefined` even when the template has a
      // matching `<ng-template #body>` element.
      for (const member of classNode.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        if (!member.name || !ts.isIdentifier(member.name)) continue;
        const propertyName = member.name.text;

        // Property decorators (e.g. @ViewChild('body', { static: true }))
        if (ts.canHaveDecorators(member)) {
          const decorators = ts.getDecorators(member);
          if (decorators) {
            for (const dec of decorators) {
              const expr = dec.expression;
              let decoratorName: string | null = null;
              if (ts.isIdentifier(expr)) decoratorName = expr.text;
              else if (
                ts.isCallExpression(expr) &&
                ts.isIdentifier(expr.expression)
              ) {
                decoratorName = expr.expression.text;
              }
              if (
                decoratorName === 'ViewChild' ||
                decoratorName === 'ViewChildren' ||
                decoratorName === 'ContentChild' ||
                decoratorName === 'ContentChildren'
              ) {
                const isFirst =
                  decoratorName === 'ViewChild' ||
                  decoratorName === 'ContentChild';
                const selector = extractDecoratorSelector(expr);
                const opts = extractDecoratorOpts(expr);
                const query = {
                  name: propertyName,
                  selector: selector ?? propertyName,
                  isFirst,
                  isStatic: opts.static ?? false,
                  descendants: opts.descendants ?? true,
                };
                if (
                  decoratorName === 'ViewChild' ||
                  decoratorName === 'ViewChildren'
                ) {
                  viewQueries.push(query);
                } else {
                  contentQueries.push(query);
                }
              }
            }
          }
        }

        // Signal-based field initializers (input(), output(), ...)
        if (!member.initializer) continue;
        const init = member.initializer;
        if (!ts.isCallExpression(init)) continue;
        const callee = init.expression;
        let calleeName: string | null = null;
        let isRequired = false;
        if (ts.isIdentifier(callee)) {
          calleeName = callee.text;
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.name &&
          ts.isIdentifier(callee.name)
        ) {
          calleeName = callee.expression.text;
          if (callee.expression.text === 'input' && callee.name.text === 'required') {
            isRequired = true;
          }
        }
        if (calleeName === 'input') {
          inputs.push({ name: propertyName, required: isRequired });
        } else if (calleeName === 'output') {
          outputs.push({ name: propertyName });
        }
      }
      return { inputs, outputs, viewQueries, contentQueries };
    };

    const extractDecoratorSelector = (expr: ts.Expression): string | null => {
      // ViewChild decorator call looks like `ViewChild('body', { ... })`
      // or `ViewChild(MyDirective, { ... })`. Return the first string
      // argument, or null when only a class ref is supplied (the JIT
      // compiler can resolve those itself via propMetadata).
      if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
        const first = expr.arguments[0];
        if (ts.isStringLiteralLike(first)) return first.text;
      }
      return null;
    };

    const extractDecoratorOpts = (
      expr: ts.Expression,
    ): { static?: boolean; descendants?: boolean } => {
      if (!ts.isCallExpression(expr) || expr.arguments.length < 2) return {};
      const optsArg = expr.arguments[1];
      if (!ts.isObjectLiteralExpression(optsArg)) return {};
      const result: { static?: boolean; descendants?: boolean } = {};
      for (const prop of optsArg.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (!ts.isIdentifier(prop.name)) continue;
        const value = prop.initializer;
        if (prop.name.text === 'static' && value.kind === ts.SyntaxKind.TrueKeyword) {
          result.static = true;
        } else if (
          prop.name.text === 'descendants' &&
          value.kind === ts.SyntaxKind.TrueKeyword
        ) {
          result.descendants = true;
        }
      }
      return result;
    };

    const hasComponentOrDirectiveDecorator = (classNode: ts.ClassDeclaration): boolean => {
      if (!ts.canHaveDecorators(classNode)) return false;
      const decorators = ts.getDecorators(classNode);
      if (!decorators) return false;
      for (const dec of decorators) {
        const expr = dec.expression;
        let name: string | null = null;
        if (ts.isIdentifier(expr)) {
          name = expr.text;
        } else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
          name = expr.expression.text;
        }
        if (name === 'Component' || name === 'Directive') return true;
      }
      return false;
    };

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (hasComponentOrDirectiveDecorator(node)) {
          const { inputs, outputs, viewQueries, contentQueries } =
            collectMembersMetadata(node);
          if (
            inputs.length > 0 ||
            outputs.length > 0 ||
            viewQueries.length > 0 ||
            contentQueries.length > 0
          ) {
            detectedClasses.push({
              name: node.name.text,
              inputs,
              outputs,
              viewQueries,
              contentQueries,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Second pass: lower TS -> JS as before.
    const result = ts.transpileModule(code, {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        emitDecoratorMetadata: true,
        sourceMap: true,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
      fileName: id,
    });

    let lowered = result.outputText;

    // Third pass: append `ɵsetClassMetadata(...)` calls at the END of
    // the lowered file. Putting them at the end means they execute
    // AFTER the `MobileDrawer = __decorate([Component({...})],
    // MobileDrawer)` reassignment, so the `propDecorators` land on
    // the decorated class binding the JIT compiler will look up.
    if (detectedClasses.length > 0) {
      // Resolve identifiers to whatever the file already imports from
      // `@angular/core`. Anything missing gets imported under a
      // collision-free alias so we don't shadow user code.
      const importRe =
        /import\s*\{([^}]+)\}\s*from\s*['"]@angular\/core['"]\s*;?/g;
      let setClassMetadataIdent: string | null = null;
      let inputIdent: string | null = null;
      let outputIdent: string | null = null;
      for (const match of lowered.matchAll(importRe)) {
        const inside = match[1];
        for (const rawName of inside.split(',')) {
          const trimmed = rawName.trim();
          if (!trimmed) continue;
          const asMatch = /^(\S+?)\s+as\s+(\S+)$/.exec(trimmed);
          const originalName = asMatch ? asMatch[1] : trimmed;
          const alias = asMatch ? asMatch[2] : trimmed;
          if (originalName === 'ɵsetClassMetadata') setClassMetadataIdent = alias;
          else if (originalName === 'setClassMetadata') setClassMetadataIdent = alias;
          else if (originalName === 'Input') inputIdent = alias;
          else if (originalName === 'Output') outputIdent = alias;
        }
      }
      const missing: string[] = [];
      if (!setClassMetadataIdent) {
        setClassMetadataIdent = 'ɵsetClassMetadata_auto';
        missing.push(`ɵsetClassMetadata as ${setClassMetadataIdent}`);
      }
      if (!inputIdent) {
        inputIdent = 'Input_auto';
        missing.push(`Input as ${inputIdent}`);
      }
      if (!outputIdent) {
        outputIdent = 'Output_auto';
        missing.push(`Output as ${outputIdent}`);
      }
      let viewChildIdent = null;
      let contentChildIdent = null;
      const hasAnyQuery = detectedClasses.some(
        (c) => c.viewQueries.length > 0 || c.contentQueries.length > 0,
      );
      if (hasAnyQuery) {
        for (const match of lowered.matchAll(importRe)) {
          const inside = match[1];
          for (const rawName of inside.split(',')) {
            const trimmed = rawName.trim();
            if (!trimmed) continue;
            const asMatch = /^(\S+?)\s+as\s+(\S+)$/.exec(trimmed);
            const originalName = asMatch ? asMatch[1] : trimmed;
            const alias = asMatch ? asMatch[2] : trimmed;
            if (originalName === 'ViewChild') viewChildIdent = alias;
            else if (originalName === 'ContentChild') contentChildIdent = alias;
          }
        }
        if (!viewChildIdent) {
          viewChildIdent = 'ViewChild_auto';
          missing.push(`ViewChild as ${viewChildIdent}`);
        }
        if (!contentChildIdent) {
          contentChildIdent = 'ContentChild_auto';
          missing.push(`ContentChild as ${contentChildIdent}`);
        }
      }
      if (missing.length > 0) {
        const helperImport = `import { ${missing.join(', ')} } from '@angular/core';\n`;
        // Find the end of the LAST existing `@angular/core` import
        // statement and insert the helper import immediately after
        // it. Falls back to absolute start if there are none.
        let insertAt = 0;
        const angularImportEnd = lowered.search(
          /\nimport\s+[\s\S]*?from\s*['"]@angular\/core['"]\s*;?[^\n]*\n/,
        );
        if (angularImportEnd >= 0) {
          // Find the newline ENDING the matched import line.
          const matched = lowered
            .substring(angularImportEnd)
            .match(/^[\s\S]*?from\s*['"]@angular\/core['"]\s*;?[^\n]*\n/);
          if (matched) {
            insertAt = angularImportEnd + matched[0].length;
          }
        }
        lowered = lowered.slice(0, insertAt) + helperImport + lowered.slice(insertAt);
      }

      // Build the appended metadata block. Each line is a single
      // `ɵsetClassMetadata(...)` call; the JIT compiler reads
      // `propDecorators` from these at component-creation time.
      const blocks: string[] = [];
      for (const cls of detectedClasses) {
        const entries: string[] = [];
        for (const i of cls.inputs) {
          entries.push(
            `            ${i.name}: [{ type: ${inputIdent}, args: [{ isSignal: true }] }]`,
          );
        }
        for (const o of cls.outputs) {
          entries.push(
            `            ${o.name}: [{ type: ${outputIdent}, args: [] }]`,
          );
        }
        for (const q of cls.viewQueries) {
          // Match Angular's `ViewChild(selector, opts)` signature so the
          // JIT compiler's `isViewQuery` predicate picks the entries up
          // and emits a `viewQuery` instruction into `ɵcmp`.
          const opts: string[] = [];
          opts.push(`first: ${q.isFirst}`);
          opts.push(`isViewQuery: true`);
          opts.push(`descendants: ${q.descendants}`);
          opts.push(`static: ${q.isStatic}`);
          entries.push(
            `            ${q.name}: [{ type: ${viewChildIdent}, args: ['${q.selector}', { ${opts.join(', ')} }] }]`,
          );
        }
        for (const q of cls.contentQueries) {
          const opts: string[] = [];
          opts.push(`first: ${q.isFirst}`);
          opts.push(`isViewQuery: true`);
          opts.push(`descendants: ${q.descendants}`);
          opts.push(`static: ${q.isStatic}`);
          entries.push(
            `            ${q.name}: [{ type: ${contentChildIdent}, args: ['${q.selector}', { ${opts.join(', ')} }] }]`,
          );
        }
        const combined = entries.join(',\n');
        blocks.push(
          `${setClassMetadataIdent}(${cls.name}, null, null, {\n${combined}\n        });`,
        );
      }

      lowered = lowered + '\n' + blocks.join('\n') + '\n';
    }

    return { code: lowered, map: result.sourceMapText };
  },
});

export default defineConfig({
  plugins: [tsLegacyDecoratorsPlugin()],
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup-msw.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.d.ts',
        'src/app/api/generated/**',
        'tests/**',
        'e2e/**',
      ],
      reporter: ['json-summary', 'json', 'text'],
      reportsDirectory: 'coverage/unit',
      reportsFilename: 'coverage',
      all: false,
      skipFull: false,
      // Thresholds live in scripts/check-coverage.mjs so the gate is
      // the single source of truth. The runner should always emit a
      // report; failing on threshold belongs to the gate, not to the
      // vitest process, otherwise the Angular unit-test builder
      // (which shares this config) blocks the wider suite on
      // pre-existing under-tested files.
      thresholds: undefined,
    },
  },
});