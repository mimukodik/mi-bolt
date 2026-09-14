# 02 — Component Contracts

## Global Header and Footer

Desktop header height is 64 px, with a dark surface. Place the unchanged brand mark on the left, main navigation in the center, and search, account and cart on the right. Also identify active navigation with an underline or another distinct indicator. Make the entire control clickable, not just its tiny icon. Derive the cart count from cart data, not from the reference image.

If navigation no longer fits, switch to a menu button and simpler search rather than reducing the text to an unreadable size. The logo must not change between pages. On mobile, keep at most the logo, menu and cart in the first row; search may occupy a full-width second row.

Use the same name, link groups and partner identity in the dark footer on every standard page. Checkout may use a shorter version with help and legal links. Include a newsletter field only when an approved, functional flow exists; disclose simulated behavior in a demo.

## Button

| Property | Requirement |
|---|---|
| Primary | Orange background, dark label, 6 px radius |
| Secondary | White background, `brand.ink` text and outline |
| Secondary on a dark surface | Transparent/dark background, light label and visible outline |
| Size | Standard minimum height 44 px; comfortable height 48 px; horizontal padding 16–24 px |
| Label | A specific action: “Details”, “Add to cart”, “Continue to delivery” |
| Hover | Change background/border without changing geometry |
| Focus | A 2 px outer focus indicator with a 2 px offset, not clipped |
| Loading | Preserve width and the label's meaning; for example, “Adding…” with a spinner |
| Disabled | Native disabled behavior; explain the reason nearby where needed |

Use `button` for actions and links for navigation. Do not disguise navigation as an empty button. Making an entire row clickable does not justify nested, conflicting interactive elements. A card's link and comparison checkbox are separate focus targets.

## Product Card

Data structure: stable identifier, product name, image and alternative text, selected variant, pricing arrangement, availability and detail-page route. Optional: verified promotion, sourced rating and comparison state.

Catalogue order: image → name → no more than two decision-supporting features → variant/storage → price → action. The recommended image aspect ratio is 4:3, with devices at a consistent optical size. Compact horizontal image-and-text cards are allowed for desktop homepage highlights, but use the same variant within a row.

The title may occupy up to two or three lines, but truncation must not hide important model-variant information. Position the price and button in the same order near the bottom of each card. If an image is missing, show a neutral placeholder and product name, not a random image of another device.

Do not give every displayed card a filled primary button: use an outlined “Details” button in catalogue views. Use a prominent primary button for a specific selection and at checkout.

## Color and Storage Selectors

One selection represents one unambiguous variant. Display the color name beside the swatch. Indicate the selected value using an icon, a border and a programmatic state. Give a white swatch a thin contrasting border so it remains visible. The clickable area must be at least 44×44 px even when the visible circle is only 24 px.

Mark and disable unavailable combinations; do not silently switch to another color, storage capacity or contract. After a change, the image, price and stock must all refer to the same variant. During asynchronous updates, an older request must not overwrite the newly selected variant's data.

## Price Block and Mobile Plan Card

Show the device price as a large number with an explicit one-time meaning. Display monthly fees with an equally readable billing period. For example:

**339 990 Ft** — device price, one-time charge  
**9 990 Ft / month** — selected mobile plan

For installment purchases, place the monthly device installment and service fee on separate lines. Do not omit the term, upfront payment or total device amount when the offer depends on them. This skill must not invent those terms.

Plan-card order: name → mobile data → calls/SMS → monthly fee → commitment and limits → selection. A selected card uses an orange border, an icon and a “Selected” label. Use “Most popular” only when supported by data or clearly marked as demo content, not as automatic decoration.

## Search, Filtering and Sorting

Search needs its own label and a clear action. Provide search suggestions only with a working keyboard interaction pattern; a plain submit-based search is also suitable for a simple MVP. Sorting uses a labeled select: “Recommended order”, “Price: low to high”, “Price: high to low”. Price sorting must use a precisely identified price field.

Desktop filter-panel width is 248–264 px; leave visible space between field groups. Accompany a price slider with editable minimum and maximum fields. Display an active filter as a chip with text and a remove button; give that button a specific name, such as “Remove 5G filter”.

For a narrow layout, use a filter drawer containing a header, all fields, “Apply” and “Clear”. Keep edits as temporary values until application; closing the drawer must not unexpectedly apply hidden changes. Derive the result count from the result source. An empty state and a network error are not the same.

## Input and Form

Always provide a visible label; a placeholder is only an example. Standard minimum height is 44 px, with a contrasting outline. Indicate required fields through text or a convention explained in advance. Show errors next to the affected field and associate them programmatically. Do not delete data already entered in an invalid field.

Validation must not harass users on every keystroke: for simple fields, show it after blur or submit, and allow it to update while the user corrects the value. Provide an error summary and sensible focus handling on form submission. Choose appropriate autocomplete/inputmode attributes; do not use a number input for every numeric identifier.

## Modal, Drawer and Toast

Modal: move from the invoking control to an appropriate initial focus target, keep navigation inside, exclude background interaction, provide an accessible close button and restore focus. A non-destructive panel may close on Escape and backdrop click. If unsaved data would be lost, obtain clear confirmation first.

A toast is supplementary feedback, not the sole channel for an error or payment result. For example, it may report “The product was added to your cart” when the cart counter actually updates. Display checkout errors persistently on the page.

## Skeleton and Empty State

A skeleton should match the expected component dimensions, not resemble an unreadable substitute price. Use restrained motion or allow it to be disabled. Empty cart: a short explanation and “Browse phones”. No results: active filters and “Clear filters”. Error: brief, non-blaming text and “Retry”; preserve previously entered values.
