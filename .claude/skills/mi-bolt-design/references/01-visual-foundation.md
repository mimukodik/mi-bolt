# 01 — Visual Foundation

## Brand Structure

The governing image, relative to the skill root, is `assets/reference/home-orange-hu.png`. It is an unchanged copy of the previously selected Hungarian-language orange MiBolt homepage. Its composition consists of a compact dark header, a wide dark product hero, a light category bar, white product cards, three marketing tiles with different content and a dark multi-column footer.

The image establishes visual character, not a verified price list or precise CSS. The package's implementable values are newly defined design decisions derived from the raster image. Do not describe a differing implementation as a pixel-perfect reproduction.

## Proportions and Colors

The primary surface of shopping pages is white. Use charcoal for the global shell and highlighted marketing blocks. Assign orange to actions, active-state indicators and limited marketing emphasis. Do not fill every card with orange or give every section a different pastel color.

| Token | Value | Role |
|---|---|---|
| `color.brand.accent` | `#FF6A00` | Primary action background, brand accent |
| `color.brand.accentHover` | `#F05F00` | Primary hover background with dark text |
| `color.brand.accentSoft` | `#FFF0E6` | Small, restrained highlight |
| `color.brand.ink` | `#A83B00` | Orange-toned text link on a white surface |
| `color.surface.page` | `#FFFFFF` | Main surface |
| `color.surface.subtle` | `#F5F6F7` | Neutral background, separating block |
| `color.surface.dark` | `#1B2024` | Header and footer |
| `color.surface.hero` | `#101416` | Hero background |
| `color.text.primary` | `#171B1F` | Body text and button labels on base orange |
| `color.text.secondary` | `#545B64` | Supporting text on a light background |
| `color.border.subtle` | `#DDE1E5` | Decorative card border |
| `color.border.control` | `#737B84` | Perceptible input boundary |

A decorative border is not a control boundary: do not use the faint border as a checkbox's only outline. Bright orange text on white is not equivalent to the darker `brand.ink` value. Correct low-contrast button labels from the approved image in the implementation.

## Typography

Default: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. An existing, approved brand font may be used if it supports the Hungarian double-acute o and u characters (U+0151 and U+0171). The package contains no font files; do not copy fonts with unknown licensing.

| Level | Desktop | Narrow Layout | Weight / Line Height |
|---|---|---|---|
| Hero heading | 52 px | 34 px | 700 / 1.08 |
| Page title | 36 px | 28 px | 700 / 1.15 |
| Section heading | 28 px | 24 px | 700 / 1.2 |
| Card title | 18 px | 18 px | 650–700 / 1.3 |
| Body text | 16 px | 16 px | 400 / 1.5 |
| Supporting text | 14 px | 14 px | 400 / 1.45 |
| Supplementary metadata | 12 px | 12 px | 400–500 / 1.4 |
| Main price | 28 px | 26 px | 700 / 1.15 |

Use 12 px only for secondary metadata. Do not shrink terms, errors, monthly fees or purchase buttons to this size. Wrap long Hungarian labels across multiple lines; do not change the entire typography system because of one long word. Align price and CTA rows across cards in the same series. `font-variant-numeric: tabular-nums` may be used for numbers.

## Spacing, Grid and Shape

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64 px. Use 4 px for optical fine-tuning; the general rhythm uses multiples of 8 px. Start with 48 px between regular sections, 24 px between related groups and 8 px between a heading and its description.

The main container must not exceed 1320 px. Outer margins are 48 px on desktop, 24 px on tablet and 16 px on mobile. At a 1440 px viewport, the 1320 px content area is centered, giving an actual margin of 60 px. The 48 px value is minimum side space, not a mandatory identical final margin at every screen width.

Card radius is 8 px, button radius 6 px, input radius 6 px and badge radius at most 4 px. Fully rounded shapes are justified only for circular color swatches or genuinely circular icons, not as the default shape throughout the interface. Spacing and thin borders are the main tools for separating content. Do not apply heavy diffuse shadows, floating stacks of cards or background blur.

## Images, Icons and Motion

Devices: neutral background, realistic materials and undistorted proportions. Show the entire product in lists; deliberate cropping is allowed in hero compositions. Use `object-fit: contain` by default for product images and `cover` for lifestyle photography. Reserve the image area's dimensions so cards do not jump during loading.

Use one approved outline-icon family per project, with a base size of 20 or 24 px and approximately 1.75–2 px stroke width. Icon-only controls also need accessible names. Do not substitute emoji for navigation or business icons.

Hover and focus transitions: 120–160 ms, primarily color and border changes. Panel transitions must not exceed 220 ms; do not use large parallax effects or automatic sliders. Disable nonessential animation when reduced motion is requested. Cards must not jump several pixels or change their neighbors' layout on hover.

## Deliberately Excluded Directions

Beige base surfaces, full-page peach gradients, purple glassmorphism, universal 24–32 px corners, generic AI sparkles, admin dashboards and chatbot-centered webshops. These are not merely “newer trends”; they conflict with the approved MiBolt direction and require a separate decision.
