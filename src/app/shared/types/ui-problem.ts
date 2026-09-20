import type { FieldError } from '../../api/generated/models/field-error';

/**
 * `UiProblem` as `docs/spec/components.md:7` defines it: the shape a
 * presentation component receives when an operation failed. It is a
 * UI type, not a wire type — the wire's `Problem` is mapped into it by
 * whichever facade owns the call.
 */
export interface UiProblem {
  readonly code: string;
  readonly message: string;
  readonly fieldErrors: readonly FieldError[];
  readonly retryable: boolean;
}
