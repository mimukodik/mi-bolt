// spec: specs/product-gallery-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';

import { test, expect } from '../fixtures/coverage';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// This file runs at every integration width, and product-page.scss lays the
// product page out differently at each of them: one column below 1024px, a
// 5fr / 4fr / 3fr grid at 1024px and wider, the page host's horizontal padding
// at --space-4, --space-6 and --space-9 and the grid's column gap at --space-8
// (tokens.css). The frame's left edge and width are therefore derived from the
// page's own layout width below, in whole pixels: the browser rounds a grid
// column to its own layout unit, so a derived column width is what that column
// rounds to and not the fraction the grid computes. Its height is not derived
// this way — a derived height lands on a half pixel at some widths, where the
// browser's layout rounds down and `Math.round` rounds up, 1px apart — so the
// height is asserted through the 4 / 3 ratio the frame's content box holds.
const DESKTOP_MIN_WIDTH = 1024;
const MEDIUM_MIN_WIDTH = 640;
const PAGE_PADDING_WIDE = 48;
const PAGE_PADDING_MEDIUM = 24;
const PAGE_PADDING_NARROW = 16;
const GRID_COLUMN_GAP = 40;
const GALLERY_COLUMN_SHARE = 5 / 12;

// product-gallery.scss pads the frame with --space-3, 8px at 640px and below,
// draws a 1px border around it and fits the photo at a 4 / 3 ratio; its counter
// and its previous, next and zoom buttons are --size-control (44px) and sit
// --space-3 inside that border, its thumbnails are --space-10 (64px) squares and
// their row is one --space-4 gap below the frame.
const FRAME_PADDING = 12;
const FRAME_PADDING_NARROW = 8;
const FRAME_BORDER = 1;
const CONTROL_SIZE = 44;
const THUMB_SIZE = 64;
const THUMB_ROW_GAP = 16;

// product-card.scss pads the card with --space-4 and draws a 2px border around
// it, so the cta's bar spans the card's own content box, 40px tall.
const CARD_PADDING = 16;
const CARD_BORDER = 2;
const CTA_HEIGHT = 40;

const pagePaddingAt = (viewportWidth: number): number =>
  viewportWidth >= DESKTOP_MIN_WIDTH
    ? PAGE_PADDING_WIDE
    : viewportWidth >= MEDIUM_MIN_WIDTH
      ? PAGE_PADDING_MEDIUM
      : PAGE_PADDING_NARROW;

const framePaddingAt = (viewportWidth: number): number =>
  viewportWidth <= MEDIUM_MIN_WIDTH ? FRAME_PADDING_NARROW : FRAME_PADDING;

/** The frame's left edge and width as the two stylesheets lay them out, against the page host's own width. */
const expectedFrame = (host: Box, viewportWidth: number): { x: number; width: number } => {
  const padding = pagePaddingAt(viewportWidth);
  const columnWidth =
    viewportWidth >= DESKTOP_MIN_WIDTH
      ? (host.width - 2 * padding - 2 * GRID_COLUMN_GAP) * GALLERY_COLUMN_SHARE
      : host.width - 2 * padding;
  return {
    x: Math.round(host.x + padding),
    width: Math.round(columnWidth),
  };
};

const readBox = (locator: Locator): Promise<Box | null> => locator.boundingBox();

/** `readBox`, rounded to whole pixels: a box's own sub-pixel fraction is not a value the plan pins. */
const readRoundedBox = async (locator: Locator): Promise<Box | null> => {
  const box = await readBox(locator);
  if (box === null) return null;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
};

/**
 * The colour a photo's alt ends with, after a space. Asserted through
 * `expect.poll` rather than read once: the alt changes after every press, so a
 * one-shot read could still see the photo the gallery left behind.
 */
const expectAltEndsWithColour = async (photo: Locator, colour: string): Promise<void> => {
  await expect
    .poll(async () => ((await photo.getAttribute('alt')) ?? '').endsWith(` ${colour}`))
    .toBe(true);
};

test.describe('Product page: gallery', () => {
  test(
    'the gallery steps through several photos with previous, next and the thumbnails',
    { tag: '@integration' },
    async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 0;
      const desktopViewport = viewportWidth >= DESKTOP_MIN_WIDTH;
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const pageHost = page.locator('app-product-page');
      const productGallery = page.getByTestId('product-gallery');
      const frame = page.getByTestId('gallery-main');
      const mainPhoto = frame.getByTestId('image-photo');
      const count = page.getByTestId('gallery-count');
      const prev = page.getByTestId('gallery-prev');
      const next = page.getByTestId('gallery-next');
      const zoom = page.getByTestId('gallery-zoom-open');
      const thumbList = productGallery.getByRole('list', { name: 'Galéria indexképei' });
      const thumbs = [
        thumbList.getByTestId('gallery-thumb-0'),
        thumbList.getByTestId('gallery-thumb-1'),
        thumbList.getByTestId('gallery-thumb-2'),
        thumbList.getByTestId('gallery-thumb-3'),
      ];
      const colourGroup = page.getByTestId('variant-color-group');
      const colourButtons = colourGroup.getByRole('button');

      // Read off the page, never pinned: the photos the gallery walks through are
      // the colours the variant selector shows, the chosen one first.
      let rotation: string[] = [];
      // The size the frame holds at the first photo, which every later stop
      // repeats. Only the size: a thumbnail press may scroll the page to bring
      // the thumbnail into view, which moves the frame's viewport-relative
      // position without moving or resizing the frame itself.
      const frameSize = { width: 0, height: 0 };
      // The console record of the whole walk, read in the last step.
      const consoleIssues: string[] = [];

      /**
       * The three readings that move in step with one another at every stop: the
       * counter "current / total", the main photo's alt — naming the photo's
       * colour rather than its position — and the current thumbnail's
       * `aria-current`. The frame's size is the one it held at the first photo, so
       * changing the photo never resizes it, and every photo of the walk loaded,
       * because the frame's own image never falls back.
       */
      const expectStop = async (
        position: number,
        colour: string,
        thumbIndex: number,
      ): Promise<void> => {
        await expect(count).toHaveText(`${position} / 4`);
        await expectAltEndsWithColour(mainPhoto, colour);
        for (const [index, thumb] of thumbs.entries()) {
          await expect(thumb).toHaveAttribute(
            'aria-current',
            index === thumbIndex ? 'true' : 'false',
          );
        }
        await expect(frame.getByTestId('image-fallback')).toHaveCount(0);
        await expect.poll(() => readRoundedBox(frame)).toMatchObject(frameSize);
      };

      // 1. Open the catalogue on the gallery scenario and wait for the grid.
      await test.step("1. Open the catalogue on the gallery scenario: `page.goto('/telefonok?mi-scenario=gallery-several-images')` and wait for the grid.", async () => {
        // The mock reads the scenario once, when the document loads, and keeps it
        // for the page's whole life, so every later step reaches its screen by
        // clicking: a `page.goto` without the query would load the default,
        // single-photo gallery.
        page.on('console', (message) => {
          const type = message.type();
          if (type === 'error' || type === 'warning') {
            consoleIssues.push(`${type}: ${message.text()}`);
          }
        });

        await page.goto('/telefonok?mi-scenario=gallery-several-images');

        // The counter reads "Keresés a katalógusban…" while the first response is
        // in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        // The default page size the twelve cards on screen are the first page of.
        await expect(page.getByTestId('catalog-page-size')).toHaveValue('12');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        // The same copy and the same twelve cards are on screen at 1920x1080 and at
        // 390x844, this file running at both; only the layout around them differs.
        // `main` scopes the heading, because the fatal-state template carries an
        // `<h1>` of its own outside it.
        await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(
          'Mobiltelefonok',
        );
      });

      // 2. Pick the phone by what the screen shows and open it through its cta.
      await test.step('2. Pick the phone by what the screen shows: the first `product-card` with no `product-card-stock` marker whose `product-card-swatches` row holds two or more swatches, and open it through its `product-card-cta`.', async () => {
        // A card renders its swatch row only when the product offers more than one
        // colour (product-card.html `colors.length > 1`), so such a row always
        // carries two or more `product-card-swatch` buttons. On the fixture's first
        // page the first such card is the third one: the two cards before it render
        // no swatch row at all, and this one's row holds four colours.
        await expect(cards.nth(0).getByTestId('product-card-swatches')).toHaveCount(0);
        await expect(cards.nth(1).getByTestId('product-card-swatches')).toHaveCount(0);
        const card = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .filter({ has: page.getByTestId('product-card-swatches') })
          .first();
        await expect(card).toBeVisible();
        await expect(card.getByTestId('product-card-swatch').nth(1)).toBeVisible();

        // The card's own cta: the same test id and the same text at both widths,
        // the card's full-width bar under the card's name, 40px tall and as wide as
        // the card's own content box.
        const cta = card.getByTestId('product-card-cta');
        await expect(cta).toHaveText('Megnézem');
        const cardBox = await readBox(card);
        if (cardBox === null) throw new Error('the picked card has no bounding box');
        const contentWidth = Math.round(cardBox.width) - 2 * (CARD_PADDING + CARD_BORDER);
        await expect
          .poll(async () => {
            const box = await readBox(cta);
            return box === null
              ? null
              : `${String(Math.round(box.width))}x${String(Math.round(box.height))}`;
          })
          .toBe(`${String(contentWidth)}x${String(CTA_HEIGHT)}`);

        await cta.click();

        await expect(pageHost).toBeVisible();
        await expect(productGallery).toBeVisible();
        await expect(page.getByTestId('product-name')).not.toBeEmpty();
      });

      // 3. Read the address bar and the colour selector of the page the card opened.
      await test.step('3. Read the address bar and the colour selector of the page the card opened.', async () => {
        // The card navigated inside the app, so the document was never reloaded and
        // the page kept the scenario it loaded with: the address carries the product
        // and its variant, with no `mi-scenario` parameter.
        await expect(page).toHaveURL(/\/telefonok\/[^/?]+\?variant=[^&?]+$/);
        await expect(page).not.toHaveURL(/mi-scenario/);

        // The four colours the card's swatch row showed: the pressed one named
        // ", kiválasztva", the other three ", elérhető".
        const chosenButton = colourGroup.getByTestId('variant-color-burgundi');
        await expect(colourButtons).toHaveCount(4);
        await expect(chosenButton).toHaveText('Burgundi');
        await expect(chosenButton).toHaveAttribute('aria-pressed', 'true');
        await expect(chosenButton).toHaveAccessibleName('Burgundi, kiválasztva');
        await expect(colourGroup.locator('button[aria-pressed="true"]')).toHaveCount(1);
        const otherColours = colourGroup.locator('button[aria-pressed="false"]');
        await expect(otherColours).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
          await expect(otherColours.nth(index)).toHaveAccessibleName(/, elérhető$/);
        }

        // The rotation the gallery walks: the chosen colour's own photo first, then
        // the phone's other colours in the order the selector lists them.
        const chosenColour = ((await chosenButton.textContent()) ?? '').trim();
        const colourLabels = (await colourButtons.allTextContents()).map((label) => label.trim());
        rotation = [chosenColour, ...colourLabels.filter((label) => label !== chosenColour)];
        expect(rotation).toHaveLength(4);
      });

      // 4. Read the gallery as it stands, before any press.
      await test.step('4. Read the gallery as it stands, before any press.', async () => {
        await expect(frame).toBeVisible();
        await expect(prev).toHaveAccessibleName('Előző kép');
        await expect(next).toHaveAccessibleName('Következő kép');
        await expect(zoom).toHaveAccessibleName('Kép nagyítása');
        // The counter reads the current photo first and the total second, and the
        // first photo is the start of the range.
        await expect(count).toHaveText('1 / 4');
        await expect(prev).toBeDisabled();
        await expect(next).toBeEnabled();

        // One thumbnail per photo, each named by its position and marked current by
        // `aria-current` rather than by a class of its own: all four carry `thumb`.
        await expect(thumbList).toBeVisible();
        await expect(thumbList.getByRole('button')).toHaveCount(4);
        for (const [index, thumb] of thumbs.entries()) {
          await expect(thumb).toHaveAccessibleName(`Ugrás a(z) ${String(index + 1)}. képre`);
          await expect(thumb).toHaveClass('thumb');
          await expect(thumb).toHaveAttribute('aria-current', index === 0 ? 'true' : 'false');
        }

        // The main photo is the frame's own image, its alt naming the colour the
        // page shows rather than the photo's position, and it is fitted rather than
        // cropped, so the whole device is inside the frame.
        await expect(mainPhoto).toBeVisible();
        await expectAltEndsWithColour(mainPhoto, rotation[0]);
        await expect(mainPhoto).toHaveCSS('object-fit', 'contain');
        await expect(mainPhoto).toHaveJSProperty('naturalWidth', 300);
        await expect(mainPhoto).toHaveJSProperty('naturalHeight', 600);
        await expect(frame.getByTestId('image-fallback')).toHaveCount(0);

        // The frame's left edge and width, against the page's layout width: the
        // page host's padding in from its own left, and the gallery column's share
        // of the grid. Its vertical position follows the page's own chrome above
        // it — where the plan's y 220 and y 308 come from — so it is asserted to
        // stand below the header rather than at a pinned y, which no two browsers
        // lay out alike.
        const hostBox = await readBox(pageHost);
        if (hostBox === null) throw new Error('the product page has no bounding box');
        const expected = expectedFrame(hostBox, viewportWidth);
        await expect
          .poll(async () => {
            const box = await readRoundedBox(frame);
            return box === null ? null : `${String(box.x)}, ${String(box.width)}`;
          })
          .toBe(`${String(expected.x)}, ${String(expected.width)}`);
        const nameBox = await readBox(page.getByTestId('product-name'));
        await expect
          .poll(async () => {
            const box = await readBox(frame);
            return box !== null && nameBox !== null && box.y >= nameBox.y + nameBox.height;
          })
          .toBe(true);
        // The size every later stop of the walk repeats.
        const measuredFrame = await readRoundedBox(frame);
        if (measuredFrame === null) throw new Error('the gallery frame has no bounding box');
        frameSize.width = measuredFrame.width;
        frameSize.height = measuredFrame.height;

        // The photo is the frame's content box: the frame's own padding and its 1px
        // border on every side.
        const frameInset = framePaddingAt(viewportWidth) + FRAME_BORDER;
        await expect
          .poll(async () => {
            const outer = await readBox(frame);
            const photo = await readBox(mainPhoto);
            if (outer === null || photo === null) return null;
            return [
              Math.round(photo.x - outer.x),
              Math.round(photo.y - outer.y),
              Math.round(outer.x + outer.width - (photo.x + photo.width)),
              Math.round(outer.y + outer.height - (photo.y + photo.height)),
            ].join(',');
          })
          .toBe(
            [frameInset, frameInset, frameInset, frameInset]
              .map((value) => String(value))
              .join(','),
          );

        // That content box is the photo framed at product-gallery.scss's 4 / 3,
        // which is what fixes the frame's height: it follows the frame's own width
        // rather than a height derived from the viewport, so the same box is
        // asserted without a derivation's half pixel.
        await expect
          .poll(async () => {
            const outer = await readBox(frame);
            if (outer === null) return null;
            const contentWidth = outer.width - 2 * frameInset;
            const contentHeight = outer.height - 2 * frameInset;
            return contentHeight === 0 ? null : contentWidth / contentHeight;
          })
          .toBeCloseTo(4 / 3, 2);

        // The counter, the previous, next and zoom buttons all sit inside the
        // frame's box: the counter and the previous button at its top left, the next
        // and zoom buttons at its right edge and the zoom button at its bottom.
        await expect
          .poll(async () => {
            const outer = await readBox(frame);
            if (outer === null) return null;
            const boxes = await Promise.all(
              [count, prev, next, zoom].map((control) => readBox(control)),
            );
            const inside = (box: Box | null): boolean =>
              box !== null &&
              box.x >= outer.x &&
              box.y >= outer.y &&
              box.x + box.width <= outer.x + outer.width &&
              box.y + box.height <= outer.y + outer.height;
            return boxes.every(inside)
              ? 'every control is inside the frame'
              : 'a control reaches outside the frame';
          })
          .toBe('every control is inside the frame');

        // The three buttons are --size-control across and the thumbnails
        // --space-10 squares.
        for (const control of [prev, next, zoom]) {
          await expect
            .poll(() => readRoundedBox(control))
            .toMatchObject({
              width: CONTROL_SIZE,
              height: CONTROL_SIZE,
            });
        }
        for (const thumb of thumbs) {
          await expect
            .poll(() => readRoundedBox(thumb))
            .toMatchObject({
              width: THUMB_SIZE,
              height: THUMB_SIZE,
            });
        }

        // The thumbnails' row starts at the frame's left edge, one --space-4 gap
        // below it.
        await expect
          .poll(async () => {
            const outer = await readBox(frame);
            const firstThumb = await readBox(thumbs[0]);
            if (outer === null || firstThumb === null) return null;
            return `${String(Math.round(firstThumb.x - outer.x))},${String(
              Math.round(firstThumb.y - (outer.y + outer.height)),
            )}`;
          })
          .toBe(`0,${String(THUMB_ROW_GAP)}`);
      });

      // 5. Press `gallery-next` three times, reading the counter, the alt and the
      // current thumbnail after each press.
      await test.step("5. Press `gallery-next` three times, reading the counter, the main photo's alt and the current thumbnail after each press.", async () => {
        for (let index = 1; index < rotation.length; index += 1) {
          await next.click();
          await expectStop(index + 1, rotation[index], index);
          if (index === 1) {
            // The middle of the range: both controls are usable.
            await expect(prev).toBeEnabled();
            await expect(next).toBeEnabled();
          }
        }
      });

      // 6. Try to step past the last photo.
      await test.step('6. Try to step past the last photo: press `gallery-next` at "4 / 4".', async () => {
        // `force` skips the actionability wait a plain press would spend forever on
        // a disabled control; the browser then delivers no activation to it, so
        // nothing moves.
        await expect(next).toBeDisabled();
        await next.click({ force: true });
        await expectStop(4, rotation[3], 3);
        // The range has one end per side, so previous still works at the last photo.
        await expect(prev).toBeEnabled();
      });

      // 7. Press `gallery-prev` three times back down the four photos.
      await test.step('7. Press `gallery-prev` three times, reading the counter, the alt and the current thumbnail each time.', async () => {
        for (let index = rotation.length - 2; index >= 0; index -= 1) {
          await prev.click();
          await expectStop(index + 1, rotation[index], index);
        }

        // At the first photo previous is disabled again and a further press leaves
        // the counter where it is: the first photo is the end of the range on that
        // side too.
        await expect(prev).toBeDisabled();
        await expect(next).toBeEnabled();
        await prev.click({ force: true });
        await expectStop(1, rotation[0], 0);
      });

      // 8. Press a thumbnail from a later photo, then another from the photo it
      // reaches.
      await test.step('8. Press a thumbnail from a later photo, then another thumbnail from the photo that reaches.', async () => {
        // A press selects the photo the thumbnail names rather than stepping by
        // one: from "1 / 4" the third thumbnail reaches straight to the third photo.
        await thumbs[2].click();
        await expectStop(3, rotation[2], 2);
        await expect(prev).toBeEnabled();
        await expect(next).toBeEnabled();

        // The main photo is the photo the pressed thumbnail holds.
        const thumbPhotoSrc =
          (await thumbs[2].getByTestId('image-photo').getAttribute('src')) ?? '';
        expect(thumbPhotoSrc).not.toBe('');
        await expect(mainPhoto).toHaveAttribute('src', thumbPhotoSrc);

        await thumbs[0].click();
        await expectStop(1, rotation[0], 0);
        await expect(prev).toBeDisabled();
      });

      // 9. Choose another colour while the gallery stands on a later photo.
      await test.step('9. Choose another colour while the gallery stands on a later photo: press the colour button `variant-color-ezust`.', async () => {
        // The plan measures the reset from the third photo at 1920x1080 and from
        // the fourth at 390x844; both are "a later photo", and the reset is the same
        // from either.
        const stops = desktopViewport ? 2 : 3;
        for (let index = 0; index < stops; index += 1) {
          await next.click();
        }
        await expectStop(stops + 1, rotation[stops], stops);

        const colourButton = page.getByTestId('variant-color-ezust');
        await expect(colourButton).toBeVisible();
        await colourButton.click();

        // The address bar carries the chosen colour's variant, and the pressed
        // button is the chosen one, ", kiválasztva", while the other three end
        // ", elérhető".
        await expect(page).toHaveURL(/[?&]variant=[^?&]*--ezust--\d+$/);
        await expect(colourButton).toHaveAttribute('aria-pressed', 'true');
        await expect(colourButton).toHaveAccessibleName(/, kiválasztva$/);
        await expect(colourGroup.locator('button[aria-pressed="true"]')).toHaveCount(1);
        const otherColours = colourGroup.locator('button[aria-pressed="false"]');
        await expect(otherColours).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
          await expect(otherColours.nth(index)).toHaveAccessibleName(/, elérhető$/);
        }

        // The gallery restarts at its first photo, which is the chosen colour's own
        // photo, and the frame's box is unchanged by the colour press.
        const chosenColour = ((await colourButton.textContent()) ?? '').trim();
        expect(chosenColour).not.toBe('');
        await expectStop(1, chosenColour, 0);
        await expect(prev).toBeDisabled();

        // The same four photos in the same rotation: the chosen colour first, the
        // phone's other colours after it.
        const labels = (await colourButtons.allTextContents()).map((label) => label.trim());
        const rotationAfter = [chosenColour, ...labels.filter((label) => label !== chosenColour)];
        expect(rotationAfter).toHaveLength(4);
        for (let index = 1; index < rotationAfter.length; index += 1) {
          await next.click();
          await expectStop(index + 1, rotationAfter[index], index);
        }
      });

      // 10. Read the console and the rendered frame after the walk.
      await test.step('10. Read the console and the rendered frame after the walk.', async () => {
        // Nothing the walk did reached the console.
        expect(consoleIssues).toEqual([]);
        // The last photo loaded too: the frame renders no first-letter fallback.
        await expect(frame.getByTestId('image-fallback')).toHaveCount(0);
      });
    },
  );
});
