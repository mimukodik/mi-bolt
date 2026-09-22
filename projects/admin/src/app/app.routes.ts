import type { Routes } from '@angular/router';

import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'bejelentkezes',
    loadChildren: () => import('./features/login/login.routes').then((m) => m.LOGIN_ROUTES),
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'attekintes' },
      {
        path: 'attekintes',
        loadChildren: () =>
          import('./features/overview/overview.routes').then((m) => m.OVERVIEW_ROUTES),
      },
      {
        path: 'termekek',
        loadChildren: () =>
          import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES),
      },
      {
        path: 'adminok',
        loadChildren: () => import('./features/admins/admins.routes').then((m) => m.ADMINS_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
