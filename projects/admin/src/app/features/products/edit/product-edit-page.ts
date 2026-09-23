import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { form } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { SubmitAttempt } from '../../../shared/forms/submit-attempt';
import { toServerErrors } from '../../../shared/forms/server-errors';
import { UploadTracker } from '../../../shared/image-upload/upload-tracker';

import { openConflict } from './conflict-dialog';
import { ProductEditStore } from './product-edit.store';
import { toFormModel, toModelPointer, toProductInput } from './product-form.mapper';
import { emptyProductForm } from './product-form.model';
import type { ProductFormModel } from './product-form.model';
import { productFormSchema } from './product-form.schema';
import { SectionCard } from './section-card';
import { BasicsSection } from './sections/basics-section';
import { ColorsSection } from './sections/colors-section';
import { DisplayCard } from './sections/display-card';
import { HighlightsSection } from './sections/highlights-section';
import { SpecGroupsSection } from './sections/spec-groups-section';
import { VariantsSection } from './sections/variants-section';

const PRODUCT_ID_PATTERN = /^[1-9][0-9]*$/;

/**
 * The product edit page (MIM-355, F19): `/termekek/uj` creates a product, `/termekek/:productId`
 * loads and saves one. Lays out the five numbered section cards beside the Megjelenítés,
 * Előnézet and Adatok side cards under a sticky header; Mentés saves through `SubmitAttempt`,
 * maps a 422 onto the form, answers a 412 with the conflict dialog's Újratöltés and a success
 * with a snack-bar, sends a fresh product to its own URL, and stays disabled while an image
 * uploads.
 */
@Component({
  selector: 'adm-product-edit-page',
  templateUrl: './product-edit-page.html',
  styleUrl: './product-edit-page.css',
  imports: [
    DatePipe,
    RouterLink,
    MatButton,
    MatIconButton,
    MatChip,
    MatChipSet,
    MatIcon,
    MatProgressBar,
    SectionCard,
    BasicsSection,
    HighlightsSection,
    ColorsSection,
    VariantsSection,
    SpecGroupsSection,
    DisplayCard,
  ],
  providers: [ProductEditStore, SubmitAttempt, UploadTracker],
})
export class ProductEditPage {
  readonly productId = input<string>();

  protected readonly store = inject(ProductEditStore);
  protected readonly attempt = inject(SubmitAttempt);
  private readonly uploads = inject(UploadTracker);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly isCreate = computed(() => this.productId() === undefined);

  /** `null` in create mode, the product id when `productId()` is a positive integer, `null` otherwise. */
  protected readonly id = computed<number | null>(() => {
    if (this.isCreate()) return null;
    const raw = this.productId();
    return raw !== undefined && PRODUCT_ID_PATTERN.test(raw) ? Number(raw) : null;
  });

  protected readonly view = computed<'form' | 'loading' | 'not-found' | 'error'>(() => {
    if (this.isCreate()) return 'form';
    if (this.id() === null) return 'not-found';
    switch (this.store.loadStatus()) {
      case 'idle':
      case 'loading':
        return 'loading';
      case 'ready':
        return 'form';
      case 'not-found':
        return 'not-found';
      case 'error':
        return 'error';
    }
  });

  /** Active featured products other than the one being edited (the store's count includes it). */
  protected readonly featuredOthers = computed(() => {
    const count = this.store.featuredCount();
    if (count === null) return null;
    const product = this.store.product();
    return product !== null && product.featured && product.status === 'active' ? count - 1 : count;
  });

  /** True once the product exists: the backend rejects a changed slug (422 SLUG_IMMUTABLE). */
  private readonly slugLocked = computed(() => !this.isCreate());

  /** Public: the spec drives and reads the form through these two directly. */
  readonly model = signal<ProductFormModel>(emptyProductForm());
  readonly form = form(
    this.model,
    productFormSchema({ featuredOthers: this.featuredOthers, slugLocked: this.slugLocked }),
  );

  protected readonly saveDisabled = computed(
    () => this.view() !== 'form' || this.attempt.disabled(this.form) || this.uploads.busy(),
  );

  /** The saved name, not the live model, so an unsaved edit does not flicker the header. */
  protected readonly title = computed(() =>
    this.isCreate() ? 'Új termék' : (this.store.product()?.name ?? 'Termék szerkesztése'),
  );

  protected readonly preview = computed(() => this.model().colors[0]?.image ?? null);

  constructor() {
    void this.store.loadFeaturedCount();
    void this.store.loadBrands();
    effect(() => {
      const id = this.id();
      untracked(() => void this.open(id));
    });
  }

  /** Loads `id`, or resets to an empty form in create mode; also clears a previous submit attempt. */
  private async open(id: number | null): Promise<void> {
    this.attempt.attempted.set(false);
    if (this.isCreate()) {
      this.form().reset(emptyProductForm());
      return;
    }
    if (id === null) return;
    await this.store.load(id);
    if (this.store.loadStatus() === 'ready') {
      const product = this.store.product();
      if (product !== null) {
        this.form().reset(toFormModel(product));
      }
    }
  }

  /** Újra: focus moves to the page title first, because the reload removes the button that holds it. */
  protected retry(title: HTMLElement): void {
    title.focus();
    void this.open(this.id());
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.attempt.run(this.form, () => this.save());
  }

  private async save(): Promise<TreeValidationResult> {
    const input = toProductInput(this.model());
    const result = this.isCreate() ? await this.store.create(input) : await this.store.save(input);
    switch (result.kind) {
      case 'saved':
        this.snackBar.open('Mentve', undefined, { duration: 4000 });
        if (this.isCreate()) {
          void this.router.navigate(['/termekek', result.product.id], { replaceUrl: true });
        } else {
          this.attempt.attempted.set(false);
          this.form().reset(toFormModel(result.product));
        }
        return undefined;
      case 'invalid':
        return toServerErrors(
          this.form,
          result.fieldErrors.map((error) => ({ ...error, path: toModelPointer(error.path) })),
        );
      case 'conflict':
        await firstValueFrom(openConflict(this.dialog));
        await this.open(this.id());
        return undefined;
      case 'failed': {
        const message =
          result.problem?.code === 'VARIANT_IN_CART'
            ? 'A mentés nem sikerült: egy törölt változat még egy vásárló kosarában van. Tartsd meg a változatot, vagy próbáld újra később.'
            : 'A mentés nem sikerült. Próbáld újra.';
        this.snackBar.open(message, undefined, {
          duration: result.problem?.code === 'VARIANT_IN_CART' ? 8000 : 4000,
        });
        return undefined;
      }
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/termekek']);
  }
}
