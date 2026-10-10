import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HalloweenPreviewState } from '../../shared/shell/halloween-preview-state';

@Component({
  selector: 'app-halloween-preview',
  template: `<p>Halloween látvány-előnézet megnyitása…</p>`,
})
export class HalloweenPreview {
  constructor() {
    inject(HalloweenPreviewState).setEnabled(true);
    void inject(Router).navigateByUrl('/');
  }
}
