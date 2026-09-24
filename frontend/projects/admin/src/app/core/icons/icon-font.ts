import { inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';

/**
 * Points every `mat-icon` at the self-hosted Material Symbols font
 * (`material-symbols/outlined.css`, loaded through `angular.json`). Called
 * from the lazily loaded login page and shell instead of a provider in
 * `app.config.ts`: any import from `@angular/material/icon` there would put
 * the whole icon module into the initial bundle (MIM-404). The registry is
 * a root singleton, so dialogs and snack bars opened later see the same
 * default. Must run in an injection context.
 */
export function applyMaterialSymbolsFont(): void {
  inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
}
