/**
 * Route entry for the delivery + payment step. The T21 `DeliveryStep`
 * owns the implementation; this module re-exports it under the
 * `DeliveryPage` name so `checkout.routes.ts` (T19) can keep its
 * import binding (`import('./features/checkout/delivery-page').then(
 * (m) => m.DeliveryPage)`) without touching the wizard when the
 * screen arrives.
 */
export { DeliveryStep as DeliveryPage } from './delivery-step';
