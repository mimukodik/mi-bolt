// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The featured grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
// (`featured-products.html`), so below its `lg` breakpoint the four cards stack
// in one column and from it up they sit in four. The catalogue's sidebar uses
// the same 1024px breakpoint (`shop-edge-mobile-filter-drawer.spec.ts`); this
// constant is read off the featured grid's own class list.
const FEATURED_COLUMNS_MIN_WIDTH = 1024;

// A featured card as the screen shows it: the "<colour> · <gb> GB" variant line
// (`p.variant` in `product-card.html`). The whitespace the template's line
// breaks leave between the three spans is dropped rather than kept, so the
// rendered text is "Zöld·256 GB" with no space around the separator; both
// patterns allow that whitespace without requiring it.
const VARIANT_LINE = /^\s*.+?\s*·\s*\d+\s*GB\s*$/;
const VARIANT_LINE_PARTS = /^(.+?)\s*·\s*(\d+)\s*GB$/;

// One featured card's own facts, read from what the screen shows.
type FeaturedCard = {
  /** The product name in the card's level-3 heading. */
  name: string;
  /** The colour name from the card's variant line. */
  colour: string;
  /** The storage number from the card's variant line, without "GB". */
  storage: string;
  /** The product slug inside the card link's path. */
  slug: string;
  /** The colour segment of the card link's `variant` parameter. */
  colourCode: string;
  /** The whole `variant` query parameter the card link carries. */
  variant: string;
};

test.describe('Shop: home, navigation and catalogue stories', () => {
  test(
    "[E020] opening each featured card lands on that card's product and variant",
    { tag: '@integration' },
    async ({ page }) => {
      const fullHd = (page.viewportSize()?.width ?? 0) >= FEATURED_COLUMNS_MIN_WIDTH;
      const featuredSection = page.getByTestId('featured-section');
      const featuredGrid = page.getByTestId('featured-grid');
      // Each card is addressed by its position in `featured-grid`, never by its
      // own `featured-card-<slug>` test id: two of the four can be the same
      // product on a different storage and then carry the same test id.
      const featuredCards = featuredGrid.getByTestId('product-card');
      const skeletons = page.locator('[data-testid^="featured-card-skeleton-"]');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const notFoundState = page.getByText('A termék nem található');

      // The four cards read in step 2, in grid order, reused by steps 3 and 4.
      const cardFacts: FeaturedCard[] = [];

      // The home page's own wait: `featured-grid` renders four
      // `featured-card-skeleton-*` placeholders until the list lands, and the
      // skeleton fades out over the content that replaces it, so the real cards
      // are read only once none is left.
      const waitForFeaturedCards = async (): Promise<void> => {
        await expect(featuredGrid).toBeVisible();
        await expect(skeletons).toHaveCount(0);
        await expect(featuredCards).toHaveCount(4);
      };

      // The plan's step 1 layout, read from the cards' own boxes: four columns
      // share one row at full HD, one column stacks them below 1024px.
      const expectFeaturedLayout = async (): Promise<void> => {
        const positions: { x: number; y: number }[] = [];
        for (let index = 0; index < 4; index += 1) {
          const box = await featuredCards.nth(index).boundingBox();
          if (box === null) throw new Error(`featured card ${String(index)} has no bounding box`);
          positions.push({ x: Math.round(box.x), y: Math.round(box.y) });
        }
        const columns = new Set(positions.map((position) => position.x)).size;
        const rows = new Set(positions.map((position) => position.y)).size;
        expect(columns).toBe(fullHd ? 4 : 1);
        expect(rows).toBe(fullHd ? 1 : 4);
      };

      // The plan's step 2 read: a card names a product and a variant, and its
      // own `product-card-cta` carries that variant as `?variant=`.
      const readCard = async (index: number): Promise<FeaturedCard> => {
        const card = featuredCards.nth(index);
        const name = ((await card.getByRole('heading', { level: 3 }).textContent()) ?? '').trim();
        const variantLine = ((await card.locator('p.variant').textContent()) ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const parts = VARIANT_LINE_PARTS.exec(variantLine);
        if (parts === null) throw new Error(`unparsable variant line: "${variantLine}"`);
        const href = (await card.getByTestId('product-card-cta').getAttribute('href')) ?? '';
        const url = new URL(href, page.url());
        const variant = url.searchParams.get('variant') ?? '';
        const segments = variant.split('--');
        return {
          name,
          colour: parts[1],
          storage: parts[2],
          slug: url.pathname.split('/').pop() ?? '',
          colourCode: segments.length >= 3 ? segments[segments.length - 2] : '',
          variant,
        };
      };

      // The plan's steps 3 and 4 check: the opened page is the card's own
      // product and its own variant, not the not-found state and not a shared
      // default.
      const expectOpenedProduct = async (card: FeaturedCard): Promise<void> => {
        await expect(productPage).toBeVisible();
        // `product-name` exists only in the loaded state, so it and the absent
        // not-found title together prove the target is neither missing nor a
        // page that failed to resolve.
        await expect(notFoundState).toHaveCount(0);
        await expect(productName).toBeVisible();
        await expect(productName).toHaveText(card.name);
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === `/telefonok/${card.slug}` &&
            url.searchParams.get('variant') === card.variant,
        );
        await expect(colourGroup).toBeVisible();
        await expect(colourGroup.locator('legend')).toContainText(`Szín: ${card.colour}`);
        await expect(page.getByTestId(`variant-color-${card.colourCode}`)).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(storageGroup).toBeVisible();
        await expect(storageGroup.locator('legend')).toContainText(`Tárhely: ${card.storage} GB`);
        await expect(page.getByTestId(`variant-storage-${card.storage}`)).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      };

      await test.step('1. Open `/` and wait for `featured-grid` to hold real cards, that is until no `featured-card-skeleton-*` placeholder remains. - expect: `featured-grid` holds four `product-card` elements. - expect: The `featured` region reads "Készülékek" with "Válassz kiemelt készülékeink közül", and `featured-all-link` reads "Összes telefon". - expect: Below 1024 px the four cards stack in one column, at full HD they sit in four columns.', async () => {
        await page.goto('/');
        await waitForFeaturedCards();

        await expect(featuredSection).toBeVisible();
        await expect(featuredSection.getByRole('heading', { level: 2 })).toHaveText('Készülékek');
        await expect(featuredSection).toContainText('Válassz kiemelt készülékeink közül');
        await expect(featuredSection.getByTestId('featured-all-link')).toHaveText('Összes telefon');

        await expectFeaturedLayout();
      });

      await test.step('2. Read the four cards in order, addressing each by its position in `featured-grid` rather than by its `featured-card-<slug>` test id, because two of the four can be the same product on a different storage and then carry the same test id. For each card note the name in its heading, its variant line "<colour> · <gb> GB", and the `href` of its `product-card-cta`, whose `variant` query parameter is that card\'s variant. - expect: All four cards name a product and a variant, and every `product-card-cta` reads "Megnézem". - expect: Two of the four variants differ only in the storage number, so the pair is distinguished by the storage in the variant line and in the link\'s `variant` parameter.', async () => {
        for (let index = 0; index < 4; index += 1) {
          const card = featuredCards.nth(index);
          await expect(card.getByRole('heading', { level: 3 })).not.toBeEmpty();
          await expect(card.locator('p.variant')).toHaveText(VARIANT_LINE);
          await expect(card.getByTestId('product-card-cta')).toHaveText('Megnézem');
          cardFacts.push(await readCard(index));
        }

        // Two of the four cards are the same product on another storage. That
        // pair is distinguished by the storage in the variant line and in the
        // link's `variant` parameter, so exactly one such pair must be present.
        const sharedProduct: [number, number][] = [];
        for (let first = 0; first < cardFacts.length; first += 1) {
          for (let second = first + 1; second < cardFacts.length; second += 1) {
            if (cardFacts[first].slug === cardFacts[second].slug) {
              sharedProduct.push([first, second]);
            }
          }
        }
        expect(sharedProduct).toHaveLength(1);
        const [firstIndex, secondIndex] = sharedProduct[0];
        const firstCard = cardFacts[firstIndex];
        const secondCard = cardFacts[secondIndex];
        expect(firstCard.colour).toBe(secondCard.colour);
        expect(firstCard.storage).not.toBe(secondCard.storage);
        expect(firstCard.variant).not.toBe(secondCard.variant);
      });

      await test.step("3. Open the first card's `product-card-cta` and wait for `product-page`. - expect: `product-name` is filled and matches the card's heading read in step 2, so the target is neither missing nor empty. - expect: The product page's not-found state does not appear: no error state reads \"A termék nem található\". - expect: The address bar carries the same `variant` value the card's link carried, and its path segment is the card's product. - expect: The on-screen selection is that variant: `variant-color-group`'s legend reads \"Szín: <colour>\" with the matching `variant-color-<code>` button selected, and `variant-storage-group`'s legend reads \"Tárhely: <gb> GB\" with the matching `variant-storage-<gb>` button selected.", async () => {
        await featuredCards.nth(0).getByTestId('product-card-cta').click();
        await expectOpenedProduct(cardFacts[0]);
      });

      await test.step("4. Return to `/` and repeat step 3 on the second card, then on the third and on the fourth. - expect: Each product page's `product-name` equals its own card's heading. - expect: Each `variant` query parameter equals its own card's variant, so the two cards that share a product open on their own storage rather than on a shared default. - expect: Each page shows a filled `product-name` and its variant legends, so no card leads to an empty name or an empty variant.", async () => {
        for (let index = 1; index < cardFacts.length; index += 1) {
          await page.goto('/');
          await waitForFeaturedCards();
          await featuredCards.nth(index).getByTestId('product-card-cta').click();
          await expectOpenedProduct(cardFacts[index]);
        }
      });
    },
  );
});
