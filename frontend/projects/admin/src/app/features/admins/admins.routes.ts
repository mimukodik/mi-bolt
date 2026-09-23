import type { Routes } from '@angular/router';

export const ADMINS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admins-page').then((m) => m.AdminsPage),
    title: 'Adminok – MiBolt Admin',
  },
];
