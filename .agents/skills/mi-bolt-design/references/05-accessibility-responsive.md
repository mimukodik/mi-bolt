# 05 — Accessibility and Responsive Design

## Reference Level

The design target is to address WCAG 2.2 AA criteria, not to claim automatic compliance. The W3C pages in the source list provide the standards background. The specific colors, dimensions and breakpoints below are MiBolt project decisions.

Normal text requires a contrast ratio of at least 4.5:1 and large text at least 3:1; do not round a failing value upward to treat it as passing. For non-text states and control boundaries needed to understand operation, 3:1 is the relevant target. A decorative card border belongs to a different category from a checkbox's only identifiable outline. Assess detailed rules against the official requirements. [S4, S5]

Project rule: shopping controls must have a target area of at least 44×44 CSS px. This is a deliberately more comfortable target, not a replacement for the exact wording of WCAG 2.2 AA 2.5.8, whose main threshold is 24×24 CSS px with exceptions. [S6]

## Color Pairs

Approved default button: dark `#171B1F` text on a `#FF6A00` background. Normal link on white: `#A83B00`, with a recognizable underline or another appropriate indicator. On a dark surface, use light text. Small white text on `#FF6A00` is prohibited as a normal combination: the package validator calculates the shortfall.

Do not call the original button image with white text an accessible example. Preserving the image and correcting implementation contrast are compatible: the original asset remains unchanged while the implemented button gains better contrast. Record the change among visual deviations.

## Keyboard and Focus

Use a sensible tab sequence that follows DOM reading order. Do not create an artificial order with positive tabindex values. Every interactive element must work with the appropriate keys, and active focus must not be lost. One focus-ring color is not necessarily suitable for every background: test blue on light surfaces and a contrasting light/orange solution on dark surfaces.

When a modal opens, focus moves to an initial element appropriate for its content, stays inside, and returns on close; the background is non-interactive. For a long content modal, do not automatically jump to the first input if it is located near the bottom. Implement the specific pattern according to the ARIA APG dialog guidance. [S7]

A fixed header or CTA must not obscure the element receiving focus. Give the close icon a name such as “Close filters”, not merely “X”. Important results must remain available after a toast disappears.

## Semantics

Give each page one main H1; heading levels must follow the content hierarchy. Use header, navigation, main-content and footer landmarks. Provide a skip-to-main-content link at the top of the page that becomes visible on focus.

Give images alternative text appropriate to their function; decorative lifestyle images may have empty alt text when the message is available as text. Product-image text may identify the specific model and view, rather than being a list of keywords. Form labels and associated errors are mandatory. Expose the selected option's state programmatically as well.

## Breakpoints

| Range | Content |
|---|---|
| 0–639 px | Single-column primary shopping flow, 16 px side spacing |
| 640–1023 px | 24 px side spacing, two-column product grid where it fits, filter drawer |
| From 1024 px | Minimum 48 px side spacing, shared desktop shell, side filters where space allows |
| From 1440 px | Maximum 1320 px container; do not stretch product cards into oversized blocks |

A breakpoint is a content rule, not an assumption about a specific device. Minimum test widths: 320, 390, 768, 1024, 1440 and 1920 CSS px. The whole page must not overflow horizontally. A genuinely two-dimensional comparison table may have its own scrollable region; the entire page may not.

The mobile filter drawer must remain within the viewport; its inner content can scroll, while close and apply remain accessible. Provide the necessary bottom spacing and safe-area handling above a fixed bottom CTA. Do not replace a mobile layout with a desktop screenshot shrunk through CSS.

## Validation and Limitations

Text enlargement, keyboard flows, reflow, screen-reader names and error identification require separate checks. Color-pair calculations and static HTML checks do not prove full WCAG compliance. Mark only views and states that were actually opened and tested as validated.
