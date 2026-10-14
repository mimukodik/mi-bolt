// projects/admin/src/app/features/products/edit/product-edit.store.ts —
// MIM-353, plan F18 part 2 of 2.
//
// `ProductEditStore` is the facade the edit page reads and writes through.
// The contract is data-only — a `load` that fetches one product, a
// `create`, a `save` that PUTs with `If-Match: "<version>"` of the product it
// last read or wrote, and the two auxiliary loads that drive the form's
// `featuredCount` gauge and the brand select. The precondition comes from the
// body's `version`, not the `ETag` header: a proxy that compresses the
// response may weaken the header to `W/"<version>"` (Cloudflare does, MIM-453),
// and the API accepts only the strong form. Each save is a discriminated union
// so the page can branch on it without inspecting a Problem body.
//
// `load` never rejects — it absorbs any non-404 status into
// `loadStatus: 'error'`. Saves never reject either: every failure is
// encoded in the returned `SaveResult` so the page can show a field-level
// error, a stale-etag conflict, or a generic failure from one place.
//
// `save` throws when called before `load` because there is no version to
// send in `If-Match`; the page guards against it, and the throw is a programmer
// error rather than a runtime state. A response that arrives after a newer
// `load()` has started leaves the store showing the newer product.

import { Injectable, computed, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../../api/generated/admin-api';
import { createAdminProduct } from '../../../api/generated/fn/admin-products/create-admin-product';
import { getAdminProduct } from '../../../api/generated/fn/admin-products/get-admin-product';
import { listAdminBrands } from '../../../api/generated/fn/admin-products/list-admin-brands';
import { listAdminProducts } from '../../../api/generated/fn/admin-products/list-admin-products';
import { replaceAdminProduct } from '../../../api/generated/fn/admin-products/replace-admin-product';
import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { AdminProductInput } from '../../../api/generated/models/admin-product-input';
import type { FieldError } from '../../../api/generated/models/field-error';
import type { Problem } from '../../../api/generated/models/problem';
import { withIfMatch } from '../../../core/api/if-match.interceptor';
import { problemOf } from '../../../core/api/problem';

/** The outcome of one create or save: a fresh saved product, a stale-etag conflict, validation errors, or an unrelated failure. */
export type SaveResult =
  | { readonly kind: 'saved'; readonly product: AdminProduct }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'invalid'; readonly fieldErrors: readonly FieldError[] }
  | { readonly kind: 'failed'; readonly problem: Problem | null };

@Injectable()
export class ProductEditStore {
  readonly #api = inject(AdminApi);

  /** Bumped by every `load()`; a `load` or `save` whose response resolves after a newer `load` started stops touching the signals below. */
  #generation = 0;

  readonly #product = signal<AdminProduct | null>(null);
  readonly #loadStatus = signal<'idle' | 'loading' | 'ready' | 'not-found' | 'error'>('idle');
  readonly #featuredCount = signal<number | null>(null);
  readonly #brands = signal<readonly string[]>([]);

  readonly product: Signal<AdminProduct | null> = this.#product.asReadonly();
  /** The `If-Match` value the next `save` sends: the loaded product's `version`, quoted. */
  readonly etag: Signal<string | null> = computed(() => {
    const product = this.#product();
    return product === null ? null : `"${String(product.version)}"`;
  });
  readonly loadStatus: Signal<'idle' | 'loading' | 'ready' | 'not-found' | 'error'> =
    this.#loadStatus.asReadonly();
  readonly featuredCount: Signal<number | null> = this.#featuredCount.asReadonly();
  readonly brands: Signal<readonly string[]> = this.#brands.asReadonly();

  /** Fetch one product. Never rejects. */
  async load(productId: number): Promise<void> {
    const generation = ++this.#generation;
    this.#loadStatus.set('loading');
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(getAdminProduct, { productId }),
      );
      if (generation !== this.#generation) return;
      this.#product.set(response.body);
      this.#loadStatus.set('ready');
    } catch (error: unknown) {
      if (generation !== this.#generation) return;
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.#product.set(null);
        this.#loadStatus.set('not-found');
        return;
      }
      this.#loadStatus.set('error');
    }
  }

  /** Create a product. Validation errors become `'invalid'`; anything else is `'failed'`. */
  async create(input: AdminProductInput): Promise<SaveResult> {
    const generation = this.#generation;
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(createAdminProduct, { body: input }),
      );
      if (generation === this.#generation) {
        this.#product.set(response.body);
      }
      return { kind: 'saved', product: response.body };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 422)) {
        const problem = problemOf(error);
        if (problem !== null && problem.fieldErrors.length > 0) {
          return { kind: 'invalid', fieldErrors: problem.fieldErrors };
        }
      }
      return { kind: 'failed', problem: problemOf(error) };
    }
  }

  /** Replace the loaded product with `If-Match: "<its version>"`. Throws when called before `load`. */
  async save(input: AdminProductInput): Promise<SaveResult> {
    const product = this.#product();
    const etag = this.etag();
    if (product === null || etag === null) {
      throw new Error('save before load');
    }
    const generation = this.#generation;
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(
          replaceAdminProduct,
          { productId: product.id, body: input },
          withIfMatch(etag),
        ),
      );
      if (generation === this.#generation) {
        this.#product.set(response.body);
      }
      return { kind: 'saved', product: response.body };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 412) {
          return { kind: 'conflict' };
        }
        if (error.status === 400 || error.status === 422) {
          const problem = problemOf(error);
          if (problem !== null && problem.fieldErrors.length > 0) {
            return { kind: 'invalid', fieldErrors: problem.fieldErrors };
          }
        }
      }
      return { kind: 'failed', problem: problemOf(error) };
    }
  }

  /** Number of `featured + active` products in the catalogue. Stays `null` on failure. */
  async loadFeaturedCount(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(listAdminProducts, {
          featured: true,
          status: 'active',
          page: 1,
          pageSize: 1,
        }),
      );
      this.#featuredCount.set(response.body.totalElements);
    } catch {
      this.#featuredCount.set(null);
    }
  }

  /** Distinct brand names the catalogue holds, or `[]` on failure. */
  async loadBrands(): Promise<void> {
    try {
      const response = await firstValueFrom(this.#api.invoke$Response(listAdminBrands, {}));
      this.#brands.set(response.body);
    } catch {
      this.#brands.set([]);
    }
  }
}
