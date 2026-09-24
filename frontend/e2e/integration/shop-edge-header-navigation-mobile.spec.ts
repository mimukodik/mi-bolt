// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The header swaps its mounts at the `lg` breakpoint (`header-nav.html`):
// below 1024px the bar shows `menu-trigger` (`lg:hidden`) and the full-width
// `mobile-search` row (`lg:hidden`), and the drawer is opened from that
// trigger. At 1024px and wider both are `display: none`, the `nav` labelled
// "Fő navigáció" is the shown navigation (`hidden ... lg:flex`) and the search
// field is `header-search-input` inside the `header-search` label. The two
// search inputs are bound to the same draft (`HeaderNav.searchDraft`), which
// mirrors the URL's `q`, so each width shows one of them.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test('the header navigation at the mobile width', { tag: '@integration' }, async ({ page }) => {
    // The two integration viewports sit on opposite sides of the header's
    // breakpoint: 390x844 shows the mobile mounts, 1920x1080 the desktop ones.
    const mobileViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

    const menuTrigger = page.getByTestId('menu-trigger');
    const mobileSearch = page.getByTestId('mobile-search');
    const mobileSearchInput = page.getByTestId('mobile-search-input');
    const headerSearch = page.getByTestId('header-search');
    const headerSearchInput = page.getByTestId('header-search-input');
    const mainNav = page.getByRole('navigation', { name: 'Fő navigáció' });
    const cartLink = page.getByTestId('cart-link');
    const cartBadge = page.getByTestId('cart-badge');
    // The dialog primitive's panel carries `role="dialog"` and the drawer's
    // label as its accessible name (`accessible-dialog.html`); the drawer is
    // deferred and mounts only while `HeaderNav.drawerOpen` is true.
    const drawerDialog = page.getByRole('dialog', { name: 'Menü' });
    const drawerNav = drawerDialog.getByRole('navigation', { name: 'Mobil navigáció' });
    const cards = page.getByTestId('product-card');
    const resultCount = page.getByTestId('result-count');
    const appliedFilters = page.getByTestId('applied-filters');
    const chips = page.getByTestId('applied-chip');

    // 1. Open `/` and read the header in the mount the viewport shows.
    await test.step('1. Open `/` and read the header in the mount the viewport shows.', async () => {
      await page.goto('/');

      if (mobileViewport) {
        // Below 1024px the trigger opens the drawer and the search sits in the
        // full-width row under the bar.
        await expect(menuTrigger).toBeVisible();
        await expect(menuTrigger).toHaveAccessibleName('Menü megnyitása');
        await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
        await expect(mobileSearch).toBeVisible();
        await expect(mobileSearchInput).toBeVisible();
        await expect(mobileSearchInput).toHaveAttribute(
          'placeholder',
          'Keresés a telefonok között…',
        );
        await expect(headerSearch).toBeHidden();
      } else {
        // At 1024px and wider the trigger and the search row are `display:
        // none`, and the navigation and the search live in the bar itself.
        await expect(menuTrigger).toBeHidden();
        await expect(mobileSearch).toBeHidden();
        await expect(mainNav).toBeVisible();
        await expect(mainNav.getByRole('link', { name: 'Mobiltelefonok' })).toBeVisible();
        await expect(headerSearchInput).toBeVisible();
      }

      // Both mounts carry the same cart link and its empty badge.
      await expect(cartLink).toHaveAccessibleName('Kosár megnyitása, jelenleg üres');
      await expect(cartBadge).toHaveText('0');
    });

    // 2. Press `menu-trigger` (the trigger is only shown below 1024 px).
    await test.step('2. Press `menu-trigger` (the trigger is only shown below 1024 px).', async () => {
      if (!mobileViewport) {
        // The trigger is `lg:hidden`, so the wide layout has no mount to open
        // the drawer from: the step belongs to the narrow layout, and the wide
        // one only confirms the button is out of the bar.
        await expect(menuTrigger).toBeHidden();
        return;
      }

      await menuTrigger.click();

      // The trigger reports its own state, and the deferred drawer arrives as
      // a dialog labelled "Menü" holding the mobile navigation.
      await expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');
      await expect(drawerDialog).toBeVisible();
      await expect(drawerNav).toBeVisible();
      await expect(drawerNav.getByRole('link')).toHaveCount(1);
      await expect(drawerNav.getByRole('link', { name: 'Mobiltelefonok' })).toBeVisible();
      await expect(drawerDialog.getByTestId('dialog-close')).toHaveAccessibleName('Bezárás');
    });

    // 3. Press that "Mobiltelefonok" link.
    await test.step('3. Press that "Mobiltelefonok" link.', async () => {
      // The link lives in a different mount per width: the drawer's "Mobil
      // navigáció" below 1024px, the bar's "Fő navigáció" at 1024px and wider
      // (`HeaderNav.navLinks` feeds both).
      const navLink = mobileViewport
        ? drawerNav.getByRole('link', { name: 'Mobiltelefonok' })
        : mainNav.getByRole('link', { name: 'Mobiltelefonok' });
      await navLink.click();

      // The catalogue renders once the route lands.
      await expect(page).toHaveURL(/\/telefonok$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
      await expect(cards.first()).toBeVisible();

      // The drawer closed on the navigation, so the trigger is reset with it.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
    });

    // 4. Search from the field the viewport shows: type "motorola" into `mobile-search-input` at the mobile viewport (`header-search-input` at 1024 px and wider) and press Enter.
    await test.step('4. Search from the field the viewport shows: type "motorola" into `mobile-search-input` at the mobile viewport (`header-search-input` at 1024 px and wider) and press Enter.', async () => {
      const searchField = mobileViewport ? mobileSearchInput : headerSearchInput;
      await searchField.fill('motorola');
      await searchField.press('Enter');

      // `HeaderNav.commitSearch` sends the draft to the catalogue as `q`, so
      // the address bar carries the search and the input mirrors it back.
      await expect(page).toHaveURL(/\/telefonok\?q=motorola$/);
      await expect(searchField).toHaveValue('motorola');

      // The grid follows the query: one match, one card and one chip.
      await expect(resultCount).toHaveText('1 találat a szűrt feltételek szerint');
      await expect(cards).toHaveCount(1);
      await expect(appliedFilters).toBeVisible();
      await expect(chips).toHaveCount(1);
      await expect(chips.first()).toContainText('Keresés: „motorola”');
    });

    // 5. Press `cart-link`.
    await test.step('5. Press `cart-link`.', async () => {
      await cartLink.click();

      await expect(page).toHaveURL(/\/penztar\/kosar$/);
      await expect(page.getByTestId('cart-page')).toBeVisible();
    });
  });
});
