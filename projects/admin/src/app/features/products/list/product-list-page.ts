import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'adm-product-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Termékek</h1>`,
})
export class ProductListPage {}
