# Test scenario acceptance catalogue

Status: specified, not implemented or executed in this planning package. Each group is further parameterized over its documented input boundaries. The row count is not a claim that all possible program paths are covered. Executable coverage independently decides acceptance.

| ID | Group | Scenario | Action | Required assertion |
|---|---|---|---|---|
|E001|foundation|default|Resolve exact versions and run toolchain gate|Latest stable major 22 accepted; next/rc/other-major and unsupported peers rejected.|
|E002|foundation|default|Build and open root page|No SSR/prerender/hydration/zone.js runtime; Angular standalone screen renders.|
|E003|foundation|skill-missing|Remove skill evidence in a controlled gate test|Execution/review gate fails; missing skill cannot be replaced by a text claim.|
|E004|coverage|coverage-canary|Execute true branch only|Both independent coverage gates fail; completing false branch makes both pass.|
|E005|coverage|coverage-lazy|Leave a lazy runtime file unloaded|File manifest contributes zeros; absent report entry cannot improve percent.|
|E006|coverage|coverage-reload|Perform app navigation then full reload|Both source segments and bootstrap are represented once in merged file map.|
|E007|coverage|coverage-broken|Feed empty/missing/NaN report|Gate fails closed; no 100% default on missing data.|
|E008|isolation|unhandled-api|Cause an unknown API request via failure scenario|MSW refuses it and test fails; static host receives no business request.|
|E009|isolation|external-egress|Cause a controlled unexpected fetch|MSW/CSP/network sandbox blocks and records failure.|
|E010|isolation|default|Run complete purchase with SDK|All business requests match exactly one MSW handler, not page.route fulfill.|
|E011|isolation|default|Open two contexts and create different carts|No fixture override, cart, receipt or key leaks across contexts.|
|E012|persistence|cart-seeded|Change quantity then reload|Line ID/variant/quantity/total restore from non-PII snapshot.|
|E013|persistence|storage-corrupt|Open app with invalid JSON/schema|Explain reset, preserve safe browsing, no uncaught exception.|
|E014|persistence|storage-version|Open app with old snapshot version|Discard incompatible data under explicit version policy; no false order.|
|E015|persistence|storage-denied|Block storage access then shop|Memory-only shopping works; reload limitation is announced.|
|E016|persistence|checkout-ready|Enter contact/address then reload|Contact/address absent from storage; redirect to data step with cart retained.|
|E017|persistence|worker-start-fails|Load demo when MSW cannot start|Fatal startup UI and retry; business APIs never fall through.|
|E018|home|default|Click main hero CTA|Catalogue opens with meaningful title/focus.|
|E019|home|default|Use 5G then stock shortcut|Expected query and matching results appear.|
|E020|home|default|Open each of four featured products|Correct slug/default variant; no missing/empty target.|
|E021|home|featured-503-once|Fail catalogue load then Retry|Useful hero persists; prices not fabricated; retry renders products.|
|E022|catalog|default|Open catalogue|16 total products; page 1 shows 12, page 2 shows 4.|
|E023|catalog|default|Search with spaces and mixed case|Trimmed NFC/case-insensitive query; URL/count/results agree.|
|E024|catalog|default|Use recommended,price_asc,price_desc,name_asc|Stable expected ordering and tie-breaks; page resets.|
|E025|catalog|default|Choose two brands plus 256 GB and stock|OR within brand; AND with other facets; each match uses one variant.|
|E026|catalog|split-variant-attributes|Choose storage/price/stock that match only separate variants|Product excluded; independent-variant matching cannot pass.|
|E027|catalog|default|Use min/max and exact equal boundary|Inclusive matching; invalid min>max blocked with error.|
|E028|catalog|default|Toggle one brand while other filters active|Own facet omitted when counting; product counts not variant counts.|
|E029|catalog|catalog-empty|Apply a zero-match query|Dedicated empty state, active filters and Reset; not a network error.|
|E030|catalog|catalog-503-once|Load failing query then Retry|Error preserves filters; retry recovers, never false zero price.|
|E031|catalog|default|Switch 12→24 and page navigation|Correct items, count and canonical URL; page resets appropriately.|
|E032|catalog|default|Open ?page=999 then load|Empty response canonicalized to last valid page with one refetch.|
|E033|catalog|default|Remove one selected chip then Reset|Only that filter removed; Reset restores query defaults.|
|E034|catalog|default|Open filter drawer, change, Cancel; repeat Apply|Cancel leaves URL/results unchanged; Apply commits once.|
|E035|catalog|default|Navigate with repeated filters then back/forward|Selections, sort, page and list restore correctly.|
|E036|catalog|invalid-query|Open unknown/invalid query params|UI canonicalizes safely; direct API malformed params return 400.|
|E037|race|slow-old-query|Type first query then change before response|New results survive delayed old response; no double subscription.|
|E038|race|slow-old-product|Switch between product routes rapidly|Old product cannot overwrite current slug or title.|
|E039|race|slow-cart-write|Request quantity then another valid action|Dispatch uses fresh returned version; no lost update.|
|E040|race|cart-conflict-once|Mutate outdated version|409 triggers refetch, preserves intent for explicit correction; no blind replay.|
|E041|product|default|Open valid slug/variant URL|Exact variant has matching price/image/storage/stock.|
|E042|product|product-404|Open nonexistent slug|Dedicated not-found with catalogue return; no fake product.|
|E043|product|product-503-once|Fail then Retry|Recover same slug; selection not replaced with unrelated device.|
|E044|product|default|Select each available pair|Exactly one variant selected, accessible selected state and coherent display.|
|E045|product|variant-unavailable|Select unavailable pair|Disabled reason; no silent substitution; Add unavailable.|
|E046|product|default|Open ?variant=missing|Explain invalid variant; require valid selection before Add.|
|E047|product|low-stock|Try decrement below1/increment beyond available|Controls/validation prevent invalid request; no hidden clamp.|
|E048|gallery|default|Use prev/next/thumbnails|Correct image/count/alt; stable frame and complete device.|
|E049|gallery|default|Open zoom, tab, Escape|Focus trapped, background excluded and trigger restored.|
|E050|gallery|image-missing|Fail selected product image|Neutral fallback and product name; other functions still work.|
|E051|gallery|default|Open/close each spec group by keyboard|Correct expanded state and associated content; no fake specification data.|
|E052|cart|default|Choose One graphite256 qty1 and add|Cart created then item mutation through SDK/MSW; badge=1 subtotal339990.|
|E053|cart|cart-seeded|Add same variant once more|One line qty2, subtotal679980; version increments once.|
|E054|cart|cart-seeded|Add silver or different capacity|Separate variant line; totals sum exact unit prices.|
|E055|cart|cart-seeded|Set qty2 then qty1|Full authoritative totals/badge agree; no rounding drift.|
|E056|cart|cart-two-lines|Remove one line|Only selected line removed; other selection retained.|
|E057|cart|cart-seeded|Remove last line|Empty-state CTA to catalogue; checkout blocked.|
|E058|cart|cart-503-once|Attempt mutation then Retry|Prior cart retained; error recovery does not duplicate item.|
|E059|cart|cart-expired|Restore expired cart|Explicit expiry and new-cart path; no silent order on expired state.|
|E060|cart|stock-lost-before-add|Add chosen variant after stock changed|409 OUT_OF_STOCK; selection shown, no misleading success.|
|E061|idempotency|idempotency-repeat|Repeat same logical write and key|Same response, one domain mutation and one version increment.|
|E062|idempotency|idempotency-conflict|Reuse key with different normalized body|409 IDEMPOTENCY_CONFLICT; prior result unchanged.|
|E063|idempotency|checkout-ready|Double-click final confirmation|Exactly one order request in flight and one receipt.|
|E064|idempotency|order-timeout-after-commit|Commit silently then Retry same request|Same DEMO number, same total, stock decremented once.|
|E065|idempotency|order-timeout-after-commit|Reload before receipt then recover|Replay/lookup receipt without contact persistence or second order.|
|E066|checkout|checkout-ready|Go review→contact→delivery|Entered values survive SPA navigation; changing draft invalidates quote.|
|E067|checkout|cart-seeded|Directly open review URL|Redirect to earliest incomplete step, not broken summary.|
|E068|checkout|draft-503-once|Save contact then Retry|Typed values retained; no advance on failure.|
|E069|checkout|order-existing|Start new shopping after completed receipt|New cart/order intent; completed cart cannot be reused.|
|E070|guards|default|Open contact/delivery/review with no cart|Cart empty screen with explanation.|
|E071|guards|order-existing|Browser Back into old review|Existing receipt or new-shopping choice; no automatic submit.|
|E072|guards|default|Open /siker/missing|404 recovery; not a success layout with invented ID.|
|E073|contact|default|Enter Teszt Elek,teszt@example.test,+36201234567|Normalized Contact sent; next step opens only after success.|
|E074|contact|default|Submit empty fields|Required messages and focus order; no draft API request.|
|E075|contact|default|Use too-short/too-long name,invalid email,wrong phone|Each relevant boundary has distinct assertion; no request until valid.|
|E076|contact|contact-422-once|Submit schema-valid contact rejected by mock rule|Map /email field error; retain all values; successful correction works.|
|E077|delivery|checkout-contact|Choose home with valid HU address|Shipping1990; complete address saved.|
|E078|delivery|checkout-contact|Choose virtual pickup|Shipping0, address omitted, no real location claim.|
|E079|delivery|checkout-contact|Submit invalid postcode/city/line1|Accessible field errors; no invalid draft saved.|
|E080|delivery|options-503-once|Fail choices load then Retry|No fabricated choice or zero shipping; retry recovers.|
|E081|delivery|checkout-ready|Change home to pickup and return review|Fresh quote total differs by1990; old payment invalidated.|
|E082|quote|checkout-ready|Create quote for One x1 home delivery|339990 +1990 =341980 HUF; qty2=681970 HUF.|
|E083|quote|quote-expired|Advance mock clock to expiry then submit|QUOTE_EXPIRED, explicit refresh/review required.|
|E084|quote|price-changed|Change fixture price before quote/order|409 PRICE_CHANGED with new cart version; user explicitly re-reviews.|
|E085|quote|stock-lost-before-order|Confirm after stock changes|No order committed; return to cart correction without wiping contact.|
|E086|quote|quote-stale-cart|Change cart after quote|Old quote cannot authorize order; new total required.|
|E087|review|checkout-ready|Open review|Correct product variant, contact, method, shipping, subtotal and total.|
|E088|review|checkout-ready|Try final action without one/both checks|Submission disabled/explained; no API order request.|
|E089|review|checkout-ready|Open terms with keyboard and close|Accessible modal; explicitly demo terms, no real subscription.|
|E090|review|checkout-ready|Use contact and delivery edit links|Correct earlier step, retained fields, invalidated previous quote.|
|E091|payment|checkout-ready|Choose demo_cod and confirm|No payment-intent call; order successfully simulated.|
|E092|payment|payment-success|Choose demo_card and confirm|Succeeded matching intent then one order; no card fields or real network.|
|E093|payment|payment-declined|Confirm then retry new intent|Remain on review; fields/cart retained; new key for new payment attempt.|
|E094|payment|payment-pending-resolves|Poll deterministic pending intent|At most ten GET polls; stop on success and create one order.|
|E095|payment|payment-pending-timeout|Keep pending for ten polls|Stop and explain unknown outcome, no false receipt or automatic new payment.|
|E096|payment|payment-response-lost|Retry original payment key|Intent not duplicated; correct existing state recovered.|
|E097|payment|payment-mismatch|Submit mismatching intent scenario|Backend rejects; no order despite client-selected success.|
|E098|order|consent-missing|Submit invalid order via contract test|422/400 as declared; UI cannot bypass acceptedTerms or simulation flag.|
|E099|order|order-atomicity|Force commit conflict with low stock|One winner or complete rollback, no partial receipt/stock mutation.|
|E100|order|order-503-once|Fail before commit then Retry|One eventual order; exact request/key reused for uncertain transport failure.|
|E101|receipt|order-existing|Open valid success route|DEMO number and explicit no real order/payment/email notice.|
|E102|receipt|order-existing|Reload success route|GET existing receipt; no POST, same totals, no PII.|
|E103|receipt|receipt-503-once|Fail GET then Retry|Existing receipt restored; no new transaction.|
|E104|receipt|order-existing|Inspect header and start new cart|Badge reflects empty/new cart, not committed items.|
|E105|navigation|default|Navigate each route with keyboard|One H1, route title, skip-to-main and visible focus.|
|E106|navigation|default|Open/close mobile menu and select category|Focus restoration and meaningful link destination.|
|E107|navigation|default|Open unmatched application path|Utility 404 with working home/catalogue recovery.|
|E108|accessibility|default|Complete purchase without mouse|No traps outside dialogs; all buttons/selectors/form fields operable.|
|E109|accessibility|default|Exercise filter,menu,zoom,terms|Initial focus, trap, background exclusion, Escape and return focus.|
|E110|accessibility|default|Use reduced-motion +200% text sizing|No nonessential motion/clipping; purchase controls remain reachable.|
|E111|accessibility|default|Measure visible purchasing controls|>=44x44 target, accessible name, non-color-only selection.|
|E112|accessibility|multiple-errors|Trigger form/server/add failures|Assert meaningful live feedback and focus; critical result persists after toast.|
|E113|responsive|default|Render all four screen families +wizard steps at six widths|No horizontal page overflow; grid/rails/controls follow screen contract.|
|E114|responsive|default|Tab/scroll around product and review on390px|No content or focused field obscured; safe-area bottom reserved.|
|E115|contract|default|Validate every example/product/options|No dangling refs, invalid fixture or duplicate operationId.|
|E116|contract|default|Exercise each generated operation|Exactly matching handlers, request shape, response status and validated schema.|
|E117|contract|contract-invalid|Wrong headers/types/ranges/unknown fields|Documented 4xx Problem response, no unexpected mutation.|
|E118|sdk|sdk-drift|Regenerate twice then modify a generated file|Stable output; unauthorized edit fails clean-generation diff.|
|E119|sdk|default|Run under root and /mi-bolt/|SDK and worker resolve same scoped logical API/media paths.|
|E120|deployment|default|Load each route directly on static host|SPA route fallback works; /api/v1 never returns HTML as data.|
|E121|deployment|worker-update|Serve newer static build and worker|Documented no-cache worker/index, immutable hashed chunks, no stale Angular PWA worker.|
|E122|deployment|default|Open optimized demo build offline from business hosts|All business data remains MSW; no real-backend fallback.|
|E123|performance|default|Measure optimized build and profile|Initial/lazy/assets/CLS budgets enforced with recorded conditions.|
|E124|performance|default|Load product and inspect network/chunks|No model-viewer or GLB unless separately approved O01.|
|E125|3d|3d-approved|Activate 3D control on licensed local device|Model+decoders local; camera works; no AR/telemetry/autoload.|
|E126|3d|3d-model-error|Fail model or WebGL|Static gallery remains usable with explanatory message.|
|E127|3d|3d-approved|Operate camera controls and change variant|Controls named; model/poster stays variant-consistent; wrapper branches covered.|
