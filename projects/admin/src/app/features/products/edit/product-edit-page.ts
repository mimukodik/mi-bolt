import { Component, input } from '@angular/core';

@Component({
  selector: 'adm-product-edit-page',
  template: `
    <h1>Termék szerkesztése</h1>
    <p>{{ productId() ?? 'Új termék' }}</p>
  `,
})
export class ProductEditPage {
  readonly productId = input<string>();
}
