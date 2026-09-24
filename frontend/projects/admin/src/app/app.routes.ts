import type { Routes } from '@angular/router';

import { adminAuthGuard } from './core/auth/admin-auth.guard';
import { guestOnlyGuard } from './core/auth/guest-only.guard';

export const routes: Routes = [
  {
    path: 'bejelentkezes',
    canActivate: [guestOnlyGuard],
    loadChildren: () => import('./features/login/login.routes').then((m) => m.LOGIN_ROUTES),
  },
  {
    path: '',
    // The shell (toolbar, side navigation, account menu, and the MatDialog and
    // MatSnackBar it injects) loads with this route, so none of it is in the
    // initial bundle (MIM-404).
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [adminAuthGuard],
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
