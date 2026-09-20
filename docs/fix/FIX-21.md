# FIX-21 — Every cart line is permanently marked busy, so quantity and remove never work

Status: DONE — 43d5b43. Disables only the mutating cart line via a writable mutatingItemId signal cleared in .finally(); AC01-AC04 measured in-body.
Severity: blocker
Source: B1 F4 (browser), A4 (S4.1 row).

## Why this is wrong

`CartPage.pendingItemIds` is documented as "the most recent in-flight item ids" but its
body returns the ids of **every** item in the cart, unconditionally. The template feeds
that set into each line's `pending` input, so every rendered line is `aria-busy` and its
`−`, `+` and "Törlés" controls are `disabled` from the moment the cart has any content.
Nothing ever clears it, because nothing ever set it: the set has no relation to any
in-flight mutation.

`docs/spec/screens.md:73` (S4.1) requires "quantity control, remove action and line
total" on every line and says "Pending disables only affected controls and contradictory
continue" and "Remove last item returns empty state". None of those is reachable today.
Two documented scenarios are blocked with it: E055 (`docs/spec/test-scenarios.md:61`,
"Set qty2 then qty1") and E057 (`:63`, "Remove last line → Empty-state CTA to catalogue").
Design rule R19 is broken as well: the line is permanently in a loading state that is not
distinct from its ready state.

## Evidence

`src/app/features/cart/cart-page.ts:101-107` — the comment and the body disagree:

```ts
  /** Most recent in-flight item ids — used to disable the line
   *  while the facade is mutating it. */
  readonly pendingItemIds = computed<ReadonlySet<string>>(() => {
    const cart = this.cart();
    if (cart === null) return new Set();
    return new Set(cart.items.map((item) => item.id));
  });
```

`src/app/features/cart/cart-page.html:55-60` passes it per line:

```html
                <app-cart-line
                  ...
                  [pending]="pendingItemIds().has(item.id)"
```

`src/app/features/cart/cart-line.html:1` and `:34-35, 52` turn that into the rendered
state:

```html
<article class="line grid gap-4 p-4 rounded" [attr.aria-busy]="pending() ? 'true' : null" data-testid="cart-line">
```

```html
        [disabled]="pending()"
        [pending]="pending()"
```

```html
      [disabled]="pending()"
```

Observed in a real browser (B1): the line renders as `article busy` with `−`, `+` and
"Törlés" all `disabled`, and a click on `+` times out with "The element did not become
interactive within the configured timeout".

The facade offers no per-item in-flight signal to read instead —
`src/app/features/cart/cart.facade.ts:114` exposes only a count
(`readonly pending: Signal<number> = this.queue.pendingCount;`) and
`MutationIntent` (`src/app/features/cart/cart-mutation-queue.ts:48-54`) carries no item
id — so the page must track the id of the line it is mutating itself.

`grep -rn "pendingItemIds" src tests e2e` matches only the two lines quoted above: no test
asserts the current behaviour, so this change breaks nothing that exists.

## What to change

**1. `src/app/features/cart/cart-page.ts:101-107`** — replace the computed with a writable
signal holding the id of the line whose mutation is in flight, and nothing else:

```ts
  /** Id of the line whose mutation is currently in flight, or null.
   *  Only that line is disabled while the facade dispatches. */
  private readonly mutatingItemId = signal<string | null>(null);

  readonly pendingItemIds = computed<ReadonlySet<string>>(() => {
    const id = this.mutatingItemId();
    return id === null ? new Set() : new Set([id]);
  });
```

Keeping the `pendingItemIds` name means the template binding does not change and the
public shape stays a set, which is what the page's other reader expects.

**2. `src/app/features/cart/cart-page.ts:211-229` (`onQuantityChanged`)** — set the id
before dispatching and clear it on **both** outcomes. `.finally()` is what clears it; a
`.then()` alone leaves the line stuck forever if the promise rejects, which is the class
of bug this task is fixing. `onRetry()` at `:250-255` already uses `.finally()`; follow
that shape.

```ts
  onQuantityChanged(item: { id: string }, quantity: number): void {
    this.transientStatus.set({ text: 'A mennyiség frissítése…', severity: 'info' });
    this.mutatingItemId.set(item.id);
    void this.facade
      .setQuantity(item.id, quantity)
      .then(() => { /* unchanged status handling */ })
      .finally(() => {
        this.mutatingItemId.set(null);
      });
  }
```

**3. `src/app/features/cart/cart-page.ts:231-248` (`onRemoveRequested`)** — the same two
changes: `this.mutatingItemId.set(itemId);` before `this.facade.removeItem(itemId)`, and a
`.finally()` that clears it. Leave the existing status-message bodies exactly as they are.

**4. Test — `tests/cart-page.spec.ts`.** That file asserts against the concatenated
component source (its own `read()` helper at `:36-46` joins the `.ts`, `.html` and `.scss`),
so add the assertions in that style, in the `T18-AC03` block that already owns quantity
and removal (`src/app/features/cart/cart-page.spec.ts:450-189`):

- the page source no longer contains
  `new Set(cart.items.map((item) => item.id))`, i.e. the pending set is not derived from
  the whole cart;
- both `onQuantityChanged` and `onRemoveRequested` set the mutating id and clear it in a
  `.finally(`.

This is a weaker instrument than a rendered-DOM assertion, and it is the one this file
and this repository can execute today: `tests/**` runs under `environment: 'node'`
(`vitest.config.ts:506-509`), where TestBed cannot render, and the DOM-capable specs under
`src/**` run only under `ng test`, which is red at baseline (`FIX-04`). The behavioural
proof for this task is the browser check below, and it is mandatory.

## Out of scope

- `CartFacade`, `CartMutationQueue` and the mutation protocol. A4 verified the facade's
  If-Match / idempotency / serialisation behaviour as correct; do not touch it. In
  particular, do not add a per-item id to `MutationIntent` — the page knows which line it
  dispatched and that is enough.
- The cart's copy: the H1 "Kosár", the CTA "Tovább a pénztárhoz", the shipping line
  (`FIX-35` owns UI copy; `docs/spec/screens.md:73` names the required strings).
- The `expired` cart state folding into `error` (A4, S4.1 row).
- QuantityControl's internal layout (`FIX-19`), which this task's browser check will also
  see on the same line.
- The cart being thrown away by a full page reload (`FIX-10`).
- Moving or restyling tests (`FIX-06`, `FIX-07`).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but tests/cart-page.spec.ts must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**Reaching the cart.** Build it by clicking and navigate with in-page links only: open
`http://localhost:4200/telefonok/demo-one-5g`, click "Kosárba teszem", then open the cart
through the header cart link. **Never load `/penztar/kosar` directly and never reload it**
— a full page load of a checkout route throws the cart away today, a real defect owned by
`FIX-10`; until that lands, a check that reloads into the cart is testing the wrong thing.

At 1440, on the cart with one line:

1. Read `article[data-testid="cart-line"]`'s `aria-busy` and the `disabled` property of
   `[data-testid="quantity-decrement"]`, `[data-testid="quantity-increment"]` and
   `[data-testid="cart-line-remove"]`.
2. Click `+`, wait for the line total to change, and read the same four values again.
3. Click "Törlés" on the last remaining line.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R19 applies and is the rule this task restores**: ready, loading (one line only) and
  empty must be distinct, observable states.
- **R24 applies**: a failed mutation must leave the cart and the line intact — the
  `.finally()` clear is what makes the controls usable again after a failure.
- **R20 and R21 apply**: once the controls are enabled again they must be keyboard
  operable, focus-visible and at least 44 × 44 CSS px.
- **R18 applies** to the badge and the totals: after a quantity change the line total, the
  subtotal and the header cart count must agree.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R17, R22, R23, R25: N/A — this change alters no colour, spacing, type, image,
  price source, narrow layout, modal or handoff artefact; it changes which lines are
  reported as busy.

## Acceptance criteria

- [ ] **FIX-21-AC01** On the cart reached by clicking, with one line present and no
      mutation in flight, `article[data-testid="cart-line"]` has no `aria-busy="true"`
      attribute, and the `disabled` property of `[data-testid="quantity-decrement"]`,
      `[data-testid="quantity-increment"]` and `[data-testid="cart-line-remove"]` is
      `false` on all three (the decrement may be disabled when the quantity is at its
      minimum of 1 — read it at quantity 2 for this criterion).
- [ ] **FIX-21-AC02** Clicking `[data-testid="quantity-increment"]` completes without a
      timeout and the line quantity, the line total and the header cart count all update
      to the new quantity (E055).
- [ ] **FIX-21-AC03** With exactly one line in the cart, clicking
      `[data-testid="cart-line-remove"]` empties the cart and the page renders the empty
      state (`app-empty-state`, with the catalogue CTA) rather than a blank line (E057,
      `docs/spec/screens.md:73`).
- [ ] **FIX-21-AC04** During an in-flight mutation on a cart holding two different lines,
      only the line being mutated reports `aria-busy="true"`; the other line's controls
      stay enabled ("Pending disables only affected controls", `docs/spec/screens.md:73`).
      If a second variant cannot be added because of a defect owned by another task,
      record that in the commit body, naming the blocking task, and mark this criterion
      blocked rather than passed.
- [ ] **FIX-21-AC05** `tests/cart-page.spec.ts` asserts that the pending set is not derived
      from the whole cart and that both mutation handlers clear the mutating id in a
      `.finally(`; `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/cart-page.spec.ts` instead.
- [ ] **FIX-21-AC06** `npm run build` exits 0.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. Commit only
after every acceptance criterion above passes, and include the spec file.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: disable only the cart line whose mutation is in flight
```
