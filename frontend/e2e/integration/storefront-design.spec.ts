import { expect, test } from '../fixtures/coverage';

test(
  'uses the selected storefront design from the home page through the cart',
  {
    tag: '@integration',
  },
  async ({ page }) => {
    const mobile = (page.viewportSize()?.width ?? 0) < 1024;

    await page.goto('/');
    const heading = page.getByTestId('hero-heading');
    const primary = page.getByTestId('hero-cta');
    const secondary = page.getByTestId('hero-cta-secondary');
    const search = page.getByTestId(mobile ? 'mobile-search-input' : 'header-search-input');
    await expect(heading).toHaveCSS('font-family', /Inter Variable/);
    await expect(heading).toHaveCSS('color', 'rgb(35, 34, 28)');
    await expect(page.getByTestId('hero-eyebrow')).toHaveCSS('font-family', /IBM Plex Mono/);
    await expect(primary).toHaveCSS('background-color', 'rgb(148, 204, 10)');
    await expect(secondary).toHaveCSS('color', 'rgb(35, 34, 28)');
    await expect(primary).toHaveCSS('border-radius', '4px');
    await expect(search).toHaveCSS('border-radius', '4px');
    expect(
      await page.evaluate(async () => {
        const inter = await document.fonts.load('700 16px "Inter Variable"', 'Őű');
        const mono = await document.fonts.load('600 16px "IBM Plex Mono"', 'Őű');
        return inter.length > 0 && mono.length > 0;
      }),
    ).toBe(true);

    await primary.click();
    await expect(page.getByTestId('catalog-sort')).toHaveCSS('border-radius', '0px');
    await expect(page.getByTestId('result-count')).toHaveCSS('font-family', /IBM Plex Mono/);
    if (mobile) {
      await page.getByTestId('filter-trigger').click();
      await expect(page.getByTestId('filter-drawer')).toBeVisible();
      await expect(page.getByTestId('drawer-min-price')).toHaveCSS('border-radius', '0px');
      await page.getByTestId('drawer-cancel').getByRole('button').click();
      await expect(page.getByTestId('filter-drawer')).toBeHidden();
    }

    const card = page
      .getByTestId('product-card')
      .filter({ hasNot: page.getByTestId('product-card-stock') })
      .first();
    await expect(card).toHaveCSS('border-radius', '0px');
    const details = card.getByTestId('product-card-cta');
    await expect(details).toHaveCSS('background-color', 'rgb(35, 34, 28)');
    await details.click();
    await expect(page.getByTestId('product-name')).toBeVisible();

    const add = mobile
      ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
      : page.getByTestId('add-to-cart-button').getByRole('button');
    await expect(add).toBeEnabled();
    await expect(add).toHaveCSS(
      'background-color',
      mobile ? 'rgb(35, 34, 28)' : 'rgb(148, 204, 10)',
    );
    await add.click();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
    await page.getByTestId('cart-link').click();

    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    const summary = page.getByTestId('order-summary');
    await expect(summary).toHaveCSS('background-color', 'rgb(35, 34, 28)');
    await expect(summary).toHaveCSS('border-radius', '0px');
    await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content).toBe(widths.viewport);
  },
);
