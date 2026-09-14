import { Routes } from '@angular/router';

/**
 * Root route table. The single home route is split across a
 * dedicated standalone component loaded with `loadComponent`
 * so it ships as its own lazy chunk and so future task
 * packets (T10 catalogue, T13 cart) can grow the table without
 * pulling their code into the initial bundle.
 *
 * `/primitives` is the internal showcase route for the design
 * task packet (T10). It renders one instance of every UI
 * primitive so the design and Playwright suites can audit them
 * in isolation. It is not a business page.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./home/home-page').then((m) => m.HomePage),
    title: 'MiBolt — kezdőlap',
  },
  {
    path: 'primitives',
    loadComponent: () =>
      import('./features/primitives-showcase/primitives-showcase').then(
        (m) => m.PrimitivesShowcase,
      ),
    title: 'MiBolt — UI primitives',
  },
];
