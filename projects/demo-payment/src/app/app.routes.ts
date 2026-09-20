import type { Routes } from '@angular/router';

import { PaymentPage } from './payment-page';

// User-visible page title; both routes share it because the demo is one page
// reachable under two URL shapes.
const PAGE_TITLE = 'Demó fizetés';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PaymentPage, title: PAGE_TITLE },
  { path: ':paymentIntentId', component: PaymentPage, title: PAGE_TITLE },
  { path: '**', redirectTo: '' },
];
