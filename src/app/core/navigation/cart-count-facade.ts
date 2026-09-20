/**
 * T17 — re-export of the root-provided `CartFacade` under the
 * `CartCountFacade` name the T11 header still binds to.
 *
 * The T11 stub exposed a writable `count` signal so the unit suite
 * could drive the badge without a full cart lifecycle. T17 replaces
 * that stub: the real `CartFacade` (providedIn root) owns the
 * authoritative cart state and surfaces `itemCount` as a derived
 * signal. Re-exporting under the same name keeps every existing
 * consumer — `AppShell`, `HeaderNav` — pointing at the single
 * root-owned instance with zero change to its import line.
 *
 * No sibling event bus. No duplicate totals. The header reads the
 * SAME `CartFacade` as the product-add surface (T18/T15) and the
 * checkout flow (T19+).
 */

export { CartFacade as CartCountFacade } from '../../features/cart/cart.facade';
