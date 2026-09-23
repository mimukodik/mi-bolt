/**
 * MSW unit setup - registers the Node service worker lifecycle for the
 * runners that name this file as a `setupFiles` entry:
 * `vitest.contract.config.ts` and the `test` target in `angular.json`.
 *
 * The lifecycle itself lives in `./msw-server`; that file's doc comment says
 * what each hook does and why the registration is a function call rather than
 * three top-level hooks here.
 *
 * Under `vitest.contract.config.ts` this module is a plain Vite module, so
 * Vitest re-evaluates it per test file and the call below gives every file in
 * the contract suite its own listen/close pair.
 *
 * Under `ng test` the Angular unit-test builder serves this path as a one-line
 * shim in front of a built chunk, so the call below runs once per worker
 * process and reaches only that worker's first spec file. That is why every
 * spec that uses the shared server calls `useMswServer()` itself; the call here
 * is what keeps the contract runner working, and where the two overlap it costs
 * nothing because `useMswServer()` guards the `listen()`.
 */
import { useMswServer } from './msw-server';

useMswServer();
