import { Routes } from '@angular/router';

import { PaymentPage } from './payment-page';

export const routes: Routes = [
  { path: '', component: PaymentPage, title: 'Demó fizetés' },
  { path: ':paymentIntentId', component: PaymentPage, title: 'Demó fizetés' },
  { path: '**', redirectTo: '' },
];
