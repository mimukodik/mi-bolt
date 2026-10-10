import type { Routes } from '@angular/router';
export const APPEARANCE_ROUTES: Routes = [
  {
    path: '',
    title: 'Halloween megjelenés – MiBolt Admin',
    loadComponent: () => import('./appearance-page').then((m) => m.AppearancePage),
  },
];
