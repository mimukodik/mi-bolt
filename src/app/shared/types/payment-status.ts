/**
 * `docs/spec/components.md:7`'s shared `PaymentStatus`, spelled the
 * way that line spells it: the declared surface `PaymentProgress`
 * (`payment-progress.ts`) renders through its `status` input.
 */
export type PaymentStatus = 'idle' | 'pending' | 'succeeded' | 'declined' | 'unknown' | 'error';
