import type { Routes } from '@angular/router';

import { provideHungarianLocaleData } from '../../core/locale/hungarian-locale';

export const ADMINS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admins-page').then((m) => m.AdminsPage),
    title: 'Adminok – MiBolt Admin',
    providers: [provideHungarianLocaleData()],
  },
];
