/**
 * Re-export of the T22 `ReviewStep` under the `ReviewPage` name the
 * lazy route resolves. The real implementation lives in
 * `review-step.ts`; keeping the route's import target stable means
 * the route table never has to change when the implementation file
 * is renamed.
 */
export { ReviewStep as ReviewPage } from './review-step';