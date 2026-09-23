import type { Routes } from '@angular/router';

import { OverviewComponent } from './overview.component';

export const OVERVIEW_ROUTES: Routes = [
  {
    path: '',
    component: OverviewComponent,
    title: 'Áttekintés – MiBolt Admin',
  },
];
