import type { Routes } from '@angular/router';

export const PRODUCTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/product-list-page').then((m) => m.ProductListPage),
    title: 'Termékek – MiBolt Admin',
  },
  {
    path: 'uj',
    loadComponent: () => import('./edit/product-edit-page').then((m) => m.ProductEditPage),
    title: 'Új termék – MiBolt Admin',
  },
  {
    path: ':productId',
    loadComponent: () => import('./edit/product-edit-page').then((m) => m.ProductEditPage),
    title: 'Termék szerkesztése – MiBolt Admin',
  },
];
