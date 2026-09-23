import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { AdminApi } from '../../api/generated/admin-api';
import { listAdminProducts } from '../../api/generated/fn/admin-products/list-admin-products';
import { listAdminUsers } from '../../api/generated/fn/admin-users/list-admin-users';

type CardKey = 'active' | 'archived' | 'featured' | 'admins';

interface OverviewCard {
  readonly key: CardKey;
  readonly title: string;
  readonly cols: number;
  readonly rows: number;
  readonly link: string;
  readonly queryParams: Readonly<Record<string, string>> | null;
}

const PRODUCT_FILTER_CARDS: readonly OverviewCard[] = [
  {
    key: 'active',
    title: 'Aktív termékek',
    cols: 2,
    rows: 1,
    link: '/termekek',
    queryParams: { status: 'active' },
  },
  {
    key: 'archived',
    title: 'Archivált termékek',
    cols: 1,
    rows: 1,
    link: '/termekek',
    queryParams: { status: 'archived' },
  },
  {
    key: 'featured',
    title: 'Kiemelt termékek',
    cols: 1,
    rows: 2,
    link: '/termekek',
    queryParams: { featured: 'true' },
  },
  { key: 'admins', title: 'Adminok', cols: 1, rows: 1, link: '/adminok', queryParams: null },
];

const HANDSET_CARDS: readonly OverviewCard[] = PRODUCT_FILTER_CARDS.map((c) => ({
  ...c,
  cols: 1,
  rows: 1,
}));

type Loadable<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error' };

interface FeaturedProduct {
  readonly id: number;
  readonly name: string;
}

interface FeaturedSummary {
  readonly total: number;
  readonly items: readonly FeaturedProduct[];
}

const LOADING = { kind: 'loading' } as const;
const FAILED = { kind: 'error' } as const;

/**
 * Áttekintés dashboard. Each card loads its own number and has its own
 * loading and error state; every card ends with a `Megnyitás` link
 * carrying the list-page query params that filter it.
 */
@Component({
  selector: 'adm-overview',
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  imports: [
    MatGridListModule,
    MatButtonModule,
    MatCardModule,
    MatListModule,
    MatIconModule,
    RouterLink,
  ],
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

  private readonly api = inject(AdminApi);

  /** Bumped at the start of every `load(key)`; a resolution whose count no longer
   *  matches is a stale response from a superseded call (e.g. two Újra clicks
   *  before the first repaints) and is dropped instead of overwriting a newer one. */
  private readonly requestGeneration: Record<CardKey, number> = {
    active: 0,
    archived: 0,
    featured: 0,
    admins: 0,
  };

  readonly activeCount = signal<Loadable<number>>(LOADING);
  readonly archivedCount = signal<Loadable<number>>(LOADING);
  readonly featured = signal<Loadable<FeaturedSummary>>(LOADING);
  readonly adminCount = signal<Loadable<number>>(LOADING);

  /** "4 / 4" once the featured request answers, "– / 4" before and after a failure. */
  readonly featuredTotal = computed(() => {
    const state = this.featured();
    return state.kind === 'ready' ? `${String(state.value.total)} / 4` : '– / 4';
  });

  constructor() {
    void this.load('active');
    void this.load('archived');
    void this.load('featured');
    void this.load('admins');
  }

  /** The count state of a card other than the featured one. */
  countOf(key: CardKey): Loadable<number> {
    if (key === 'active') return this.activeCount();
    if (key === 'archived') return this.archivedCount();
    return this.adminCount();
  }

  /** Loads one card; the Újra button calls it too. Never rejects. */
  async load(key: CardKey): Promise<void> {
    const generation = ++this.requestGeneration[key];
    const isStale = (): boolean => this.requestGeneration[key] !== generation;

    if (key === 'featured') {
      this.featured.set(LOADING);
      try {
        const page = await firstValueFrom(
          this.api.invoke(listAdminProducts, {
            status: 'active',
            featured: true,
            sort: 'rank',
            pageSize: 4,
          }),
        );
        if (isStale()) return;
        this.featured.set({
          kind: 'ready',
          value: {
            total: page.totalElements,
            items: page.items.map((item) => ({ id: item.id, name: item.name })),
          },
        });
      } catch {
        if (!isStale()) this.featured.set(FAILED);
      }
      return;
    }
    if (key === 'admins') {
      this.adminCount.set(LOADING);
      try {
        const admins = await firstValueFrom(this.api.invoke(listAdminUsers, undefined));
        if (isStale()) return;
        this.adminCount.set({ kind: 'ready', value: admins.length });
      } catch {
        if (!isStale()) this.adminCount.set(FAILED);
      }
      return;
    }
    const target = key === 'active' ? this.activeCount : this.archivedCount;
    target.set(LOADING);
    try {
      const page = await firstValueFrom(
        this.api.invoke(listAdminProducts, { status: key, pageSize: 1 }),
      );
      if (isStale()) return;
      target.set({ kind: 'ready', value: page.totalElements });
    } catch {
      if (!isStale()) target.set(FAILED);
    }
  }
}
