# Component ownership and communication contracts

Every component execution and verification cites `docs/design/yettel.md`, the design reference. Public inputs use input()/input.required(); intents use output(). Private local changes use signal(); derived view-models use computed(). Signal Forms fields are the deliberate parent-owned two-way binding exception. No presentation component knows the SDK or repository.

## Shared types

`CatalogFilters = {brands: readonly string[]; storageGb: readonly (128|256|512)[]; minPrice?:number; maxPrice?:number; inStock:boolean; is5g:boolean}`. `CatalogQuery = CatalogFilters & {q:string; sort:Sort; page:number; pageSize:12|24; featured?:boolean}`. `Sort = recommended | price_asc | price_desc | name_asc`. `Facets` is the ProductPage.facets schema. `FilterIdentity = {name: keyof CatalogFilters | 'q' | 'featured'; value?:string|number}`. `CheckoutStep = cart | contact | delivery | review | success`. `AsyncStatus = idle | loading | success | empty | error`. `UiProblem = {code:string; message:string; fieldErrors:FieldError[]; retryable:boolean}`. `CheckoutDraft` composes optional Contact, DeliverySelection and paymentMethod. `ReviewState = quoting | ready | expired | price-changed | stock-error | submitting | error`. `PaymentStatus = idle | pending | succeeded | declined | unknown | error`. `CategoryShortcut = {label:string; query:Partial<CatalogQuery>}`. `LicensedLocalModel = {src:string; licenseReference:string; variantId:string}`. `ViewerError = load | decode | unsupported`. `FieldTree<T>` is Angular Signal Forms typed field-tree API, not a handwritten replacement. Wire types Money,Cart,Variant,Quote,Image,FieldError are generated from OpenAPI.

## Component catalogue

### AppRoot — shared / T11

**Owner:** root.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Render top-level RouterOutlet and persistent global live region; coordinate fatal bootstrap surface without rendering invented commerce data.

**Required states:** booting,ready,fatal.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### MarketingLayout — home / T11

**Owner:** layout.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Compose AppHeader + DemoNotice + content outlet + full AppFooter; dark hero belongs to Home, not layout.

**Required states:** ready.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ShopLayout — catalogue/product / T11

**Owner:** layout.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Reuse full shopping header/footer, common content width and breadcrumb slot (the trail is switched off for now behind `BREADCRUMB_VISIBLE`; owner, 2026-09-22, MIM-234); no marketing hero.

**Required states:** ready.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CheckoutLayout — purchase / T11

**Owner:** checkout route.

**Signal inputs:** `step: CheckoutStep`.

**Outputs:** `none`.

**Functions:** Compact header, purchase stepper, content/summary columns and shorter footer; preserve CheckoutFacade for all child steps.

**Required states:** ready,blocked.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AppHeader — shared / T11

**Owner:** local presentation.

**Signal inputs:** `cartCount:number; searchQuery:string; compact:boolean`.

**Outputs:** `searchSubmitted:string; menuRequested:void`.

**Functions:** Show live MiBolt brand/nav/search/cart; derive count from parent input; no direct business HTTP.

**Required states:** default,focus,menu-open; empty cart is count0, not an error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AppFooter — shared / T11

**Owner:** local presentation.

**Signal inputs:** `compact:boolean`.

**Outputs:** `demoInfoRequested:void`.

**Functions:** Working catalogue/demo-information links only; no fake account/newsletter/social controls.

**Required states:** default,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### DemoNotice — shared / T10

**Owner:** local presentation.

**Signal inputs:** `persistenceMode: durable|memory`.

**Outputs:** `none`.

**Functions:** Persistent Hungarian simulation disclosure; explain memory-only/reload behavior without suggesting real order fulfillment.

**Required states:** default,memory-warning.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### NavigationDrawer — shared / T11

**Owner:** local presentation.

**Signal inputs:** `opened:boolean; trigger:HTMLElement`.

**Outputs:** `closed:void`.

**Functions:** Render mobile navigation as focus-managed modal, restore focus; no internal route state duplication.

**Required states:** closed,open,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ProductImage — shared / T10

**Owner:** local presentation.

**Signal inputs:** `image:Image; productName:string; aspectRatio:string`.

**Outputs:** `loadFailed:void`.

**Functions:** Reserve dimensions, object-fit contain, accessible alt; missing asset shows neutral named fallback.

**Required states:** loading,loaded,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### PriceBlock — shared / T10

**Owner:** local presentation.

**Signal inputs:** `money:Money|null; label:string; status:AsyncStatus`.

**Outputs:** `none`.

**Functions:** Hungarian integer HUF formatting, one-time meaning; never display zero for unknown/loading/error price.

**Required states:** loading,ready,error; hover/selected/success N/A read-only.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AccessibleDialog — shared / T10

**Owner:** local presentation.

**Signal inputs:** `opened:boolean; label:string; initialFocus; restoreTarget`.

**Outputs:** `closed:void`.

**Functions:** Focus trap, backdrop/inert semantics, Escape, explicit close and restoration; supports filter/zoom/terms content.

**Required states:** closed,open,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AsyncContent — shared / T10

**Owner:** local presentation.

**Signal inputs:** `status:AsyncStatus; problem:UiProblem|null; hasPrevious:boolean`.

**Outputs:** `retryRequested:void`.

**Functions:** Distinct skeleton, error, empty, refresh and loaded presentation; previous usable data can remain under explicit refresh warning.

**Required states:** loading,refreshing,success,empty,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### StatusMessage — shared / T10

**Owner:** local presentation.

**Signal inputs:** `message:string; severity:info|error|success; persistent:boolean`.

**Outputs:** `dismissed:void`.

**Functions:** Role=status or alert with controlled announcements, no critical result only in transient toast.

**Required states:** info,error,success,dismissed.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### FormFieldMessage — shared / T10

**Owner:** local presentation.

**Signal inputs:** `fieldId:string; errors:FieldError[]; touched:boolean; submitted:boolean`.

**Outputs:** `none`.

**Functions:** Link visible label/errors via aria-describedby; show touched/submitted errors and server JSON-pointer mappings.

**Required states:** pristine,valid,invalid,server-error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### HomePage — home / T14

**Owner:** page container.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Load config/featured catalogue through AppConfigFacade and generated catalogue boundary; compose hero, shortcuts, featured list and how-demo-works.

**Required states:** loading,ready,featured-error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### HeroSection — home / T14

**Owner:** local presentation.

**Signal inputs:** `title:string; subtitle:string; artwork:Image`.

**Outputs:** `none`.

**Functions:** Live H1 and primary catalogue router link, secondary demo-explainer link; artwork is decorative illustration only.

**Required states:** default,focus; price/selection N/A.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CategoryShortcuts — home / T14

**Owner:** local presentation.

**Signal inputs:** `items:CategoryShortcut[]`.

**Outputs:** `none`.

**Functions:** Three proper router links: all devices, 5G, in stock; build canonical query parameters.

**Required states:** default,hover,focus,active.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### FeaturedProducts — home / T14

**Owner:** local presentation.

**Signal inputs:** `items:ProductSummary[]; status:AsyncStatus`.

**Outputs:** `retryRequested:void`.

**Functions:** Show exactly four configured products when present, shared cards and list error/skeleton states.

**Required states:** loading,success,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ProductCard — catalogue/home / T13

**Owner:** local presentation.

**Signal inputs:** `product:ProductSummary`.

**Outputs:** `none`.

**Functions:** Image/name/two highlights/matching variant/price; Details is router link with slug+variant; do not nest actions or add a filled primary per card.

**Required states:** default,hover,focus,image-error; no card mutation.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CatalogPage — catalogue / T13

**Owner:** page container.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Compose result heading, FilterPanel/FilterDrawer, toolbar, applied chips, grid and pagination; delegate writes to CatalogFacade.

**Required states:** loading,ready,empty,error,refreshing.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### FilterPanel — catalogue / T13

**Owner:** local presentation.

**Signal inputs:** `value:CatalogFilters; facets:Facets; disabled:boolean`.

**Outputs:** `filtersChanged:CatalogFilters`.

**Functions:** Control brand/storage/min/max/stock/5G; validate local price range; emit complete filter value, never query HTTP itself.

**Required states:** default,selected,focus,disabled,invalid.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### FilterDrawer — catalogue / T13

**Owner:** local presentation.

**Signal inputs:** `applied:CatalogFilters; facets:Facets; opened:boolean`.

**Outputs:** `applied:CatalogFilters; closed:void`.

**Functions:** Own a transient copy while open; Apply commits once, Cancel/Escape discard. Sticky footer remains accessible within scrolling dialog.

**Required states:** closed,open,draft-changed,invalid,disabled.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AppliedFilters — catalogue / T13

**Owner:** local presentation.

**Signal inputs:** `query:CatalogQuery`.

**Outputs:** `filterRemoved:FilterIdentity; cleared:void`.

**Functions:** Named removable chips and clear-all, with accessible remove labels; no own filter source of truth.

**Required states:** default,selected,focus; no filters renders nothing.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CatalogToolbar — catalogue / T13

**Owner:** local presentation.

**Signal inputs:** `total:number; sort:Sort; pageSize:12|24; status:AsyncStatus`.

**Outputs:** `sortChanged:Sort; pageSizeChanged:12|24; openFilters:void`.

**Functions:** Live result count, sort and page-size controls; mobile filter trigger with selected-count cue.

**Required states:** loading,ready,disabled,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### Pagination — catalogue / T13

**Owner:** local presentation.

**Signal inputs:** `page:number; pageSize:number; total:number`.

**Outputs:** `pageChanged:number`.

**Functions:** Previous/next and numbered page navigation with aria-current; out-of-range handled by facade.

**Required states:** default,active,disabled,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ProductPage — product / T16

**Owner:** page container.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Compose breadcrumbs (switched off for now behind `BREADCRUMB_VISIBLE`, MIM-234), gallery, configuration, price, add controls, spec groups and narrow sticky buy rail; CartFacade injection only at container/add orchestrator.

**Required states:** loading,ready,error,not-found.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ProductGallery — product / T16

**Owner:** local presentation.

**Signal inputs:** `images:Image[]; selectedImageId:string; productName:string`.

**Outputs:** `imageSelected:string; zoomRequested:string`.

**Functions:** Prev/next, nonautoplay thumbnails, counter, keyboard controls; variant image collection change remains coherent.

**Required states:** loading,ready,image-error,zoom-open.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### VariantSelector — product / T16

**Owner:** local presentation.

**Signal inputs:** `variants:Variant[]; selectedId:string|null; disabled:boolean`.

**Outputs:** `variantSelected:string`.

**Functions:** Resolve exact color+storage combination; name swatches, checkmark/aria-selected, disabled reason; never choose a substitute.

**Required states:** default,selected,unavailable,focus,disabled.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AddToCartControl — product / T18

**Owner:** local presentation.

**Signal inputs:** `variant:Variant|null; pending:boolean; error:UiProblem|null`.

**Outputs:** `addRequested:{variantId:string;quantity:number}` (the quantity is fixed at 1; the page-level intent never invents a different value).

**Functions:** Single primary CTA with native disabled/in-flight label and stable width; emit one intent, no own cart persistence.

**Required states:** default,hover,focus,disabled,loading,error,success.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### SpecificationAccordion — product / T16

**Owner:** local presentation.

**Signal inputs:** `groups:SpecGroup[]`.

**Outputs:** `expandedChanged:string[]`.

**Functions:** Semantic disclosure/table groups from fixture, not screenshots; label selected memory context when relevant.

**Required states:** collapsed,expanded,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### MobileBuyRail — product / T16

**Owner:** local presentation.

**Signal inputs:** `money:Money|null; available:boolean; pending:boolean; error:UiProblem|null; success:string|null`.

**Outputs:** `addRequested:void; errorDismissed:void; successDismissed:void`.

**Functions:** Narrow viewport-only sticky purchase price/action; reserve bottom space and honor safe-area; hidden nonmobile variant not focusable; surfaces the page-level add-to-cart success message via a dismissible banner whose "Bezárás" hands focus back to the rail CTA.

**Required states:** default,loading,disabled,error,success,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CartPage — purchase/cart / T18

**Owner:** page container.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Read global CartFacade, render lines/summary and continue; navigate contact only with valid cart.

**Required states:** loading,ready,empty,error,expired.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CartLine — purchase/cart / T18

**Owner:** local presentation.

**Signal inputs:** `line:CartItem; pending:boolean`.

**Outputs:** `removeRequested:string`.

**Functions:** Media/title/exact variant/line price (no separate unit price, like yettel.hu's cart; owner, 2026-09-22), the quantity as read-only text and remove; emit intent only, no optimistic overwrite.

**Required states:** default,pending,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### OrderSummary — purchase/shared / T18

**Owner:** local presentation.

**Signal inputs:** `subtotal:Money|null; shipping:Money|null; total:Money|null; itemCount:number; final:boolean`.

**Outputs:** `none`.

**Functions:** Read-only one-time summary. Shipping before selection says calculated next step, not fake 0; final amount only from Quote/Receipt.

**Required states:** loading,provisional,final,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### CheckoutStepper — purchase/shared / T19

**Owner:** local presentation.

**Signal inputs:** `current:CheckoutStep; completed:CheckoutStep[]`.

**Outputs:** `backRequested:CheckoutStep`.

**Functions:** List numbered steps and aria-current; only prior completed steps navigable; success replaces purchase actions.

**Required states:** current,complete,future,focus.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ContactStep — purchase/contact / T20

**Owner:** CheckoutFacade form owner.

**Signal inputs:** `contactFields:FieldTree<Contact>; saveState:AsyncStatus`.

**Outputs:** `continueRequested:void`.

**Functions:** Own rendered Signal Form fields; fullName/email/phone, local+backend errors, fictional-data notice and next action.

**Required states:** pristine,dirty,invalid,valid,saving,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### DeliveryStep — purchase/delivery / T21

**Owner:** CheckoutFacade form owner.

**Signal inputs:** `options:CheckoutOptions; fields:CheckoutFieldTree; saveState:AsyncStatus`.

**Outputs:** `continueRequested:void; retryOptions:void`.

**Functions:** Render delivery options, conditional address and simulated payment selection; no real-card inputs.

**Required states:** loading,ready,invalid,saving,error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### AddressForm — purchase/delivery / T21

**Owner:** local presentation.

**Signal inputs:** `fields:FieldTree<Address>; required:boolean`.

**Outputs:** `none`.

**Functions:** HU postcode/city/line1/line2 validation and labels; bind parent fields rather than cloning state.

**Required states:** hidden,pristine,valid,invalid,server-error.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### PaymentMethodSelector — purchase/delivery / T21

**Owner:** local presentation.

**Signal inputs:** `value:demo_card|demo_cod|null; disabled:boolean`.

**Outputs:** `methodChanged:demo_card|demo_cod`.

**Functions:** Two radio options with explicit simulation copy; no fee or real payment widget.

**Required states:** default,selected,focus,disabled.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### ReviewStep — purchase/review / T22

**Owner:** page container.

**Signal inputs:** `quote:Quote|null; cart:Cart; draft:CheckoutDraft; state:ReviewState`.

**Outputs:** `editRequested:contact|delivery; refreshQuote:void; submitRequested:void`.

**Functions:** Full order review, current quote, both unchecked consents and terms dialog; distinct stale/changed/stock feedback.

**Required states:** quoting,ready,expired,price-changed,stock-error,submitting.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### SuccessStep — purchase/success / T24

**Owner:** page container.

**Signal inputs:** `none`.

**Outputs:** `none`.

**Functions:** Read getOrder for route ID, show privacy-minimized receipt and no-real-order notice; new purchase creates new cart.

**Required states:** loading,confirmed,error,not-found.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


### Product3dViewer — product optional / O01

**Owner:** optional adapter.

**Signal inputs:** `model:LicensedLocalModel; poster:Image; enabled:boolean`.

**Outputs:** `loaded:void; failed:ViewerError`.

**Functions:** Deferred model-viewer adapter, local assets/decoders, keyboard controls, static gallery fallback; absent from baseline.

**Required states:** not-loaded,loading,ready,error,unavailable.

All interactive states additionally require visible hover/focus and native disabled semantics where relevant. Read-only display components do not invent selection/loading/success states when no operation exists; the explicit required-state field governs applicability. Each rendered state maps to the owning task's unit criteria.


## Shared focus styling

The two :focus-visible rules in src/styles/primitives.css own the focus ring: one for text-like controls (input, select, textarea) and one for everything else. A component overrides the shared rule only when the standard lime ring would be unreadable on its surface — a lime-on-lime button on the accent strip, a lime-on-navy CTA on a hero band — and the override names that case in a comment beside it.


## Example: precise signal input/output boundary

This is an implementation pattern, not a compiled or tested deliverable in this planning package.

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Variant } from '../../api/generated/models/variant';

@Component({
  selector: 'mi-add-to-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [disabled]="blocked()" (click)="requestAdd()">
      @if (pending()) { Hozzáadás… } @else { Kosárba teszem }
    </button>
    @if (variant()?.availability === 'out_of_stock') {
      <p role="status">Ez a változat most nem rendelhető a demóban.</p>
    }
  `,
})
export class AddToCartControl {
  readonly variant = input<Variant | null>(null);
  readonly pending = input(false);
  readonly addRequested = output<{variantId: string; quantity: number}>();
  readonly blocked = computed(() => {
    const v = this.variant();
    return this.pending() || !v || v.availability !== 'in_stock';
  });
  requestAdd(): void {
    const v = this.variant();
    if (!v || this.blocked()) return;
    this.addRequested.emit({variantId: v.id, quantity: 1});
  }
}
```

Parent: `[variant]="product.vm().selectedVariant" [pending]="cart.pending()" (addRequested)="cart.addItem($event)"` is a conceptual binding. The public CartFacade.addItem(command): void command owns subscription/queue lifecycle. It invokes a private Observable queue subscribed exactly once; no container subscription and no un-subscribed cold Observable are allowed. The readonly DTO is never mutated by the child.

## Communication examples

1. **Filter change:** FilterPanel output → CatalogPage → CatalogFacade Router write → generated listProducts Observable → MSW → immutable vm signal → toolbar/cards/chips. URL is the shared state, not events between sibling cards.
2. **Variant add:** VariantSelector output → ProductFacade exact selection → ProductGallery/PriceBlock inputs → AddToCartControl intent → CartFacade mutation queue → SDK/MSW → Cart signal → header/cart/summary. No unrelated component writes the badge.
3. **Submit:** ReviewStep output → CheckoutFacade verifies Signal Form/consent/current Quote → order orchestrator → optional mock intent → createOrder → returned receipt → Router success → SuccessStep getOrder. A UI click alone cannot produce a success state.
