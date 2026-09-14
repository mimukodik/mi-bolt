# 04 — Hungarian UI Copy, Prices and Provider Data

## Hungarian Interface

The public demo's default language is Hungarian, `hu-HU`. Use a friendly, helpful, matter-of-fact tone with informal second-person address. Keep navigation and action labels short. Their intended meanings are: “Mobile phones”, “Mobile plans”, “Accessories”, “Cart”, “Details”, “Add to cart”, “Clear filters” and “Retry”. All examples in this English-language skill must be localized for the Hungarian interface.

Do not translate brand or model names. Use abbreviations only for familiar technical units: GB, TB, 5G. “Wearables” may use the Hungarian term meaning “Smart devices”, but maintain the project's selected vocabulary consistently. Clarify the business meaning rather than using a literal translation of marketing phrases such as “Upgrade anytime”.

Example error meaning: “We couldn't load the offers right now. Your filters have been preserved.” Unacceptable: “Something went wrong!!!” Button labels should identify the actual next step rather than saying “Continue” everywhere.

## Price Display

Every monetary value needs a currency and a pricing arrangement. Calculate values using the project's money-handling conventions, not formatted strings. In a forint demo, example output is `339 990 Ft` for a one-time amount and `9 990 Ft` followed by a localized per-month suffix for a recurring amount. A non-breaking space can keep the number and currency together. Formatting may use `Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 })`; do not parse the resulting string back into a number.

Do not convert euro amounts shown in the image using an estimated exchange rate. There are two acceptable approaches: the user supplies the official Hungarian offer, or the demo uses forint prices from a separate fixture, visibly labeled with the localized meaning of “Demo data — not a real offer”.

## Separating Financial Concepts

| Concept | Label Meaning | Requirement |
|---|---|---|
| One-time device amount | Device price | Currency and explicit one-time meaning |
| Immediate upfront payment | Upfront payment | Must not be presented as the full device price |
| Device installment | Device installment / month | Term and total device amount available |
| Subscription | Mobile plan / month | Separate from the device installment |
| Other fee | Specific fee name | Identify whether it is one-time or recurring |
| Promotion | Discount | Sourced eligibility and duration |

Do not fabricate a credit offer, annual percentage rate or legal terms from missing business data. Display this content from the approved partner source or state that the information is not yet available. Summaries must remain mathematically consistent even in a demo.

## Data Provenance and Source Priority

The project's approved data source takes priority: API, export or supplied product list. A promotional image is secondary visual material, not a database. Fixtures must include `isDemo: true`. For real offers, include a source identifier and retrieval time as required by the project.

If a price/stock request fails, do not substitute zero, another brand's data or a value read from the screenshot. Use a status meaning “Price currently unavailable” or “Stock could not be checked”, with retry instead of purchase.

Generated product images do not verify real hardware specifications. Likewise, claims such as “Award-winning”, “Nationwide 5G”, satisfaction percentages and review counts may appear only with supporting sources. A 14-day returns statement in the reference copy is not automatically the partner's policy either.

## Demo for Two Providers

The provider identifier defines the boundary for brand identity and commercial state. Separate at least the logo, name, color tokens, approved copy, product catalogue, plans, promotions, cart, selected configuration and access credentials. Partner configuration must not be merely a CSS class when commercial data also differs.

The base package contains only the fictional MiBolt brand. Do not guess the names of the two real companies. Adapt to a partner when the user requests it, using that brand's own assets. MiBolt orange is normative for the selected demo; do not simply replace another official brand's color with orange without permission.

When switching partners, do not leave behind the previous logo, cart count or another provider's promotion. Include the provider identifier in storage keys and request-cache keys. Define and disclose what happens to an existing cart; do not combine incompatible data.

## Demo and Live Behavior

The demo interface must not request real payment-card details or expose actual customer data in images, logs or sample files. Use a non-deliverable example for sample addresses; do not automatically insert the user's personal information.

After “Complete demo order”, clearly state that the operation was a simulation. This design skill does not authorize live submissions, subscriptions, payments or data transfers. Do not turn read-only or mock operations into real submissions for the sake of the demo.
