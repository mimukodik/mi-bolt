/**
 * T19 — child routes under `/penztar`.
 *
 * The five wizard steps each get their own lazy chunk; the page
 * components themselves live in their respective feature folders
 * (cart-page.ts, contact-page.ts, ...). This file owns:
 *
 *   - the `path → loadComponent` mapping,
 *   - the route guards (`contactGuard`, `deliveryGuard`,
 *     `reviewGuard`, `successGuard`),
 *   - the page title shown in the document tab,
 *   - the static `step` value the layout indicator uses to
 *     highlight the current step,
 *   - the per-route `providers` array that wires the real
 *     `CONTACT_DRAFT_SAVER` factory on the `/adatok` step. The
 *     default `providedIn: 'root'` factory in `contact-step.ts`
 *     returns a no-op `{ ok: true }`, which previously let the
 *     submitter advance to `/penztar/szallitas` without ever
 *     reaching `PUT /api/v1/checkout/{cartId}`. Overriding the
 *     token here routes the save through `CartFacade` (cart id +
 *     version) and the generated SDK (the actual PUT) so the draft
 *     is persisted before navigation.
 *
 * The previous inline definition in `app.routes.ts` has been
 * replaced with a single `loadChildren: () => import(...)` so the
 * four pages ship as a single lazy bundle. The `CheckoutLayout`
 * component still owns the breadcrumb indicator (T11) and the
 * four-step ribbon.
 */

import type { Routes } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { contactGuard, deliveryGuard, reviewGuard, successGuard } from './checkout.guards';

import { CheckoutLayout } from '../../layouts/checkout-layout';

import { Api } from '../../api/generated/api';
import { ApiConfiguration as ApiConfig } from '../../api/generated/api-configuration';
import { withIfMatch } from '../../core/api/demo-session.interceptor';
import { updateCheckout } from '../../api/generated/fn/checkout/update-checkout';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { freshIdempotencyKey } from '../../shared/utils/idempotency-key';

import {
  CONTACT_DRAFT_SAVER,
  type ContactDraftSaver,
  type ContactSaveResult,
  type ContactSubmission,
} from './contact-step';
import { pointerToFieldKey, type ContactFieldKey } from './contact.schema';

/**
 * Maps a 422 body to the `ContactFieldKey`-keyed shape
 * `ContactSaveResult` exposes. Unknown paths (i.e. server errors
 * that do not target one of the three contact inputs) are dropped
 * because the Signal Form in `contact-step.ts` can only attach
 * errors to fields it knows about.
 */
function mapFieldErrors(
  entries: readonly { path: string; message: string }[],
): Partial<
  Record<ContactFieldKey, readonly { code: string; message: string; pointer?: string }[]>
> {
  const out: Partial<
    Record<ContactFieldKey, readonly { code: string; message: string; pointer?: string }[]>
  > = {};
  for (const entry of entries) {
    const key = pointerToFieldKey(entry.path);
    if (key === null) continue;
    const bucket = out[key] ?? [];
    out[key] = [...bucket, { code: 'server', message: entry.message, pointer: entry.path }];
  }
  return out;
}

/**
 * Maps an SDK / network error to the `ContactSaveResult` shape the
 * contact-step's Signal Form `submit(action)` expects. Mirrors
 * `CheckoutFacade.mapError` for the fields the contact step
 * surfaces; nothing else in the wizard reads them.
 */
function mapErrorToSaveResult(error: unknown): ContactSaveResult {
  if (error instanceof HttpErrorResponse) {
    const body = (error.error ?? {}) as {
      detail?: string;
      fieldErrors?: { path: string; message: string }[];
    };
    const fieldErrors = mapFieldErrors(body.fieldErrors ?? []);
    return {
      ok: false,
      ...(Object.keys(fieldErrors).length > 0 && { fieldErrors }),
      message: body.detail ?? error.message,
    };
  }
  return { ok: false, message: String(error) };
}

/**
 * Real `ContactDraftSaver` factory. Reads the active cart id and
 * version from the root-provided `CartFacade`, then issues
 * `PUT /api/v1/checkout/{cartId}` with body `{ contact }` via the
 * generated SDK. Using `CartFacade` directly (rather than
 * `CheckoutFacade.saveSection`) avoids depending on the wizard's
 * `loadSession()` step — the contact page does not require the
 * session to be loaded yet to persist a draft.
 *
 * After the PUT succeeds the returned `CheckoutSession` body is
 * fed back into the root `CheckoutFacade` via `loadSession()` so
 * the wizard's `session` signal carries the new contact section.
 * Without this step the `deliveryGuard` would still see
 * `session.contact === undefined` and reject navigation to
 * `/penztar/szallitas`, leaving the user stuck on the contact
 * step even after a successful draft save (F2 fix).
 *
 * `useFactory` factories run inside an injection context, so
 * `inject()` is safe to call here even though this is a plain
 * function — same pattern `CartFacade` / `CheckoutFacade` use to
 * manually wire the generated SDK because Vitest's esbuild
 * pipeline does not emit `@Injectable()` decorator metadata.
 */
function buildContactDraftSaver(
  cartFacade: CartFacade,
  checkoutFacade: CheckoutFacade,
): ContactDraftSaver {
  const api = new Api(inject(ApiConfig), inject(HttpClient));
  return async (contact: ContactSubmission): Promise<ContactSaveResult> => {
    const cart = cartFacade.cart();
    if (cart === null) {
      return { ok: false, message: 'A kosár nem áll készen.' };
    }
    try {
      await firstValueFrom(
        api.invoke(
          updateCheckout,
          {
            cartId: cart.id,
            'Idempotency-Key': freshIdempotencyKey(),
            body: {
              contact: {
                fullName: contact.fullName,
                email: contact.email,
                phone: contact.phone,
              },
            },
          },
          withIfMatch(cart.version),
        ),
      );
      // PUT 200 — mirror the server-side session into the wizard
      // facade so `deliveryGuard` reads `session.contact` and lets
      // the user advance to the delivery step.
      await checkoutFacade.loadSession(cart.id, { clearOnLoad: false });
      return { ok: true };
    } catch (error) {
      return mapErrorToSaveResult(error);
    }
  };
}

/**
 * Route table for `/penztar/...`. The parent layout (`CheckoutLayout`)
 * is mounted in `app.routes.ts` so the layout chrome (header, footer
 * suppression, step indicator) wraps every child.
 */
export const checkoutRoutes: Routes = [
  {
    path: 'kosar',
    component: CheckoutLayout,
    data: { step: 'cart' },
    children: [
      {
        path: '',
        loadComponent: () => import('../cart/cart-page').then((m) => m.CartPage),
        title: 'MiBolt — Kosár',
      },
    ],
  },
  {
    path: 'adatok',
    component: CheckoutLayout,
    data: { step: 'contact' },
    children: [
      {
        path: '',
        canMatch: [contactGuard],
        loadComponent: () => import('./contact-page').then((m) => m.ContactPage),
        // Override the root-provided no-op default with the real
        // facade-backed saver. Lives on the route (not the component)
        // so the binding survives any re-creation of the lazy chunk
        // and so the wizard's other steps do not pick up a Checkout
        // dependency they do not use.
        providers: [
          {
            provide: CONTACT_DRAFT_SAVER,
            useFactory: buildContactDraftSaver,
            deps: [CartFacade, CheckoutFacade],
          },
        ],
        title: 'MiBolt — Kapcsolattartási adatok',
      },
    ],
  },
  {
    path: 'szallitas',
    component: CheckoutLayout,
    data: { step: 'delivery' },
    children: [
      {
        path: '',
        canMatch: [deliveryGuard],
        loadComponent: () => import('./delivery-page').then((m) => m.DeliveryPage),
        title: 'MiBolt — Átvétel és fizetés',
      },
    ],
  },
  {
    path: 'ellenorzes',
    component: CheckoutLayout,
    data: { step: 'review' },
    children: [
      {
        path: '',
        canMatch: [reviewGuard],
        loadComponent: () => import('./review-page').then((m) => m.ReviewPage),
        title: 'MiBolt — Rendelés ellenőrzése',
      },
    ],
  },
  {
    path: 'siker/:orderId',
    component: CheckoutLayout,
    data: { step: 'success' },
    children: [
      {
        path: '',
        canActivate: [successGuard],
        loadComponent: () => import('./success-step').then((m) => m.SuccessStep),
        title: 'MiBolt — Demórendelés elkészült',
      },
    ],
  },
];

/**
Default export so `loadChildren` consumers can use it directly.
*/
export default checkoutRoutes;
