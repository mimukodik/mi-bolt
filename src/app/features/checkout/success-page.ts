/**
 * Re-export of the T24 `SuccessStep` under the `SuccessPage` name the
 * lazy route resolves. The real implementation lives in
 * `success-step.ts`; keeping the route's import target stable means
 * the route table never has to change when the implementation file
 * is renamed.
 */
export { SuccessStep as SuccessPage } from './success-step';