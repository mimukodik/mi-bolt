/**
 * MSW unit setup for the admin project — registers the Node service
 * worker lifecycle for the runner that names this file as a
 * `setupFiles` entry: the `test` target in `angular.json`.
 *
 * The lifecycle itself lives in `./msw-server`; that file's doc
 * comment says what each hook does and why the registration is a
 * function call rather than three top-level hooks here.
 *
 * Under `ng test` the Angular unit-test builder serves this path as
 * a one-line shim in front of a built chunk, so the call below runs
 * once per worker process and reaches only that worker's first spec
 * file. That is why every spec that uses the shared server calls
 * `useMswServer()` itself; the call here is what keeps the worker
 * running when no spec file would otherwise listen for it, and where
 * the two overlap it costs nothing because `useMswServer()` guards
 * the `listen()`.
 */
import { useMswServer } from './msw-server';

useMswServer();
