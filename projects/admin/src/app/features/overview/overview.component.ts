import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

interface OverviewCard {
  readonly title: string;
  readonly subtitle: string | null;
  readonly cols: number;
  readonly rows: number;
  readonly link: string;
  readonly queryParams: Readonly<Record<string, string>> | null;
}

const PRODUCT_FILTER_CARDS: readonly OverviewCard[] = [
  {
    title: 'Aktív termékek',
    subtitle: null,
    cols: 2,
    rows: 1,
    link: '/termekek',
    queryParams: { status: 'active' },
  },
  {
    title: 'Archivált termékek',
    subtitle: null,
    cols: 1,
    rows: 1,
    link: '/termekek',
    queryParams: { status: 'archived' },
  },
  {
    title: 'Kiemelt termékek',
    subtitle: '– / 4',
    cols: 1,
    rows: 2,
    link: '/termekek',
    queryParams: { featured: 'true' },
  },
  { title: 'Adminok', subtitle: null, cols: 1, rows: 1, link: '/adminok', queryParams: null },
];

const HANDSET_CARDS: readonly OverviewCard[] = PRODUCT_FILTER_CARDS.map((c) => ({
  ...c,
  cols: 1,
  rows: 1,
}));

/**
 * Áttekintés dashboard. Card counts are placeholders (F25 fills them);
 * the schematic's per-card `more_vert` menu is removed, every card ends
 * with a `Megnyitás` link carrying the list-page query params that filter it.
 */
@Component({
  selector: 'adm-overview',
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatGridListModule, MatIconModule, MatButtonModule, MatCardModule, RouterLink],
})
export class OverviewComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly cards = computed<readonly OverviewCard[]>(() =>
    this.isHandset() ? HANDSET_CARDS : PRODUCT_FILTER_CARDS,
  );
}
