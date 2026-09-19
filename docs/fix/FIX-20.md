# FIX-20 — Contact step must validate on continue and must not pre-fill itself

Status: PLANNED — not executed.
Severity: blocker
Source: B1 F3 (empty-form bypass), B3 F7 (prefill, "Contact" row), B2 "Uncertain" (prefill blocked B1's repro), A4 F1 (validation triplicated).

## Why this is wrong

Two defects on one screen, and they interact.

**The bypass.** B1 reported that "Tovább a szállításhoz" navigates straight to
`/penztar/szallitas` from a completely empty form with no error shown anywhere. That
violates `docs/spec/screens.md:77` — "All fields required… field messages, error summary
on attempted invalid continue" — and test scenario E074
(`docs/spec/test-scenarios.md:80`): "Submit empty fields → Required messages and focus
order; no draft API request".

**The prefill.** The three fields arrive filled with real-looking values. The design
prototype shows those same strings as grey **placeholders**
(`docs/design/prototype.html:37`, the `field(...)` calls pass `'Teszt Elek'`,
`'teszt@example.test'` and `'+36201234567'` as the placeholder argument). A form that
arrives pre-filled also silently satisfies "All fields required", which is why B2, running
the same flow later, could not reproduce B1's empty-form bypass at all: nothing was empty.
Remove the prefill first, and the bypass either reproduces or it does not — that ordering
is part of the task, not an optimisation.

**The structural half.** The contact field rules are declared three times, so any future
correction has to be made three times or the copies drift (A4 F1).

## Evidence

**Prefill.** `src/app/features/checkout/contact-step.ts:125-135`:

```ts
/**
 * Fixture defaults: synthetic data so the demo never hints at a
 * real person. `example.test` is reserved by RFC 2606 for exactly
 * this kind of use; "Teszt Elek" is a Hungarian placeholder name
 * used in test fixtures across the project.
 */
const INITIAL_CONTACT: ContactInput = {
  fullName: 'Teszt Elek',
  email: 'teszt@example.test',
  phone: '+36 30 123 4567',
};
```

seeded into the form model at `contact-step.ts:187`:

```ts
  readonly model = signal<ContactInput>({ ...INITIAL_CONTACT });
```

`src/app/features/checkout/contact-step.html:43-53, 67-77, 91-101` — the three inputs
carry no `placeholder` attribute at all, so the values can only arrive as real content.

**The bypass claim does not match the code as read, and the contradiction is recorded
here rather than resolved by guessing.** `contact-step.ts:372-391` submits through
Angular's Signal Forms `submit()` and returns without navigating when it reports failure:

```ts
      const ok = await submit(contactForm, {
        action: async (rootField) => { ... },
        onInvalid: () => {
          this.focusSummary();
          this.focusFirstInvalidField();
        },
      });

      if (!ok) {
```

The installed typings say that is the right shape and the right return value:
`node_modules/@angular/forms/types/_structure-chunk.d.ts:2093` declares
`submit<TModel>(form, options?): Promise<boolean>` — "@returns Whether the submission was
successful" — and `:981-993` declares `onInvalid` as the callback that runs "when
attempting to submit the form data but validation is failing". The schema does declare
all three fields required (`contact-step.ts:206`, `:224`, `:242`). Read alone, this
code cannot navigate from an invalid form. One report says it does. **What settles it is
the repro in "How to verify", run after the prefill is removed**; the acceptance criteria
below state the required behaviour, which is checkable whichever way the repro falls.

**Triplication.** The same two regular expressions are declared in three files:

```
src/app/features/checkout/contact.schema.ts:57  const EMAIL_RFC5322_SUBSET = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
src/app/features/checkout/contact.schema.ts:60  const PHONE_INTERNATIONAL = /^\+36\d{8,9}$/;
src/app/features/checkout/contact-step.ts:137   const EMAIL_RFC5322_SUBSET = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
src/app/features/checkout/contact-step.ts:140   const PHONE_E164 = /^\+36\d{8,9}$/;
src/app/features/checkout/checkout-form.model.ts:76  export const PHONE_PATTERN = /^\+36[0-9]{8,9}$/;
```

(`\d` and `[0-9]` are the same set in JavaScript, so `PHONE_PATTERN` is a third copy of
the same rule, not a variant of it.)

## What to change

**1. Stop pre-filling — `src/app/features/checkout/contact-step.ts:125-135, 187`.**
Replace the seeded constant with an empty model and move the three strings to
placeholders, which is where the prototype puts them:

```ts
/**
 * The form starts empty. The example values the prototype shows are
 * placeholders on the inputs, not content: a pre-filled form would
 * satisfy "All fields required" (screens.md S4.2) without the user
 * having entered anything.
 */
const EMPTY_CONTACT: ContactInput = { fullName: '', email: '', phone: '' };
```

```ts
  readonly model = signal<ContactInput>({ ...EMPTY_CONTACT });
```

**2. `src/app/features/checkout/contact-step.html`** — add one `placeholder` attribute to
each of the three inputs, using the prototype's exact strings
(`docs/design/prototype.html:37`): `placeholder="Teszt Elek"` on
`#contact-fullname-input`, `placeholder="teszt@example.test"` on `#contact-email-input`,
`placeholder="+36201234567"` on `#contact-phone-input`. Change no label, no help text and
no `data-testid`.

**3. Run the E074 repro (see "How to verify") and fix what it shows.** If the empty form
still advances, the defect is real and this task fixes it — start from `onSubmit()`
(`contact-step.ts:360-405`) and from the two ways it can be reached: the form's
`(submit)` handler (`contact-step.html:32`) and the CTA's `(pressed)` handler
(`contact-step.html:153`). One lead worth checking first: the shared `Button` declares a
`type` input (`src/app/shared/ui/button/button.ts:41`) that its own template never binds —
`src/app/shared/ui/button/button.html:2` hardcodes `type="button"` — so the CTA never
raises the form's native submit event, and the two paths are not equivalent. If the empty
form does **not** advance, record that with the evidence (screenshot, network log) in the
commit body, as AC09 requires; the acceptance criteria are then satisfied by the
behaviour, not by a code change.

**4. Remove the duplicate rule declarations.** One owner: `contact.schema.ts`, which is
pure, has no imports, and is already exercised directly by `tests/contact-step.spec.ts`.

- `src/app/features/checkout/contact.schema.ts:57-58,60` — export both constants
  (`export const EMAIL_RFC5322_SUBSET = …`, `export const PHONE_INTERNATIONAL = …`).
- `src/app/features/checkout/contact-step.ts:137-140` — delete both local constants and
  import them from `./contact.schema`, which this file already imports from
  (`contact-step.ts:75-86`). The two use sites are `:233` and `:253`; the local name
  `PHONE_E164` disappears with the constant.
- `src/app/features/checkout/checkout-form.model.ts:76` — keep the exported name, drop the
  duplicated literal:

```ts
import { PHONE_INTERNATIONAL } from './contact.schema';

/** Re-exported under the historical name; the rule itself lives in contact.schema.ts. */
export const PHONE_PATTERN = PHONE_INTERNATIONAL;
```

  The name must stay exported: `src/app/features/checkout/checkout-state.spec.ts:69` imports it. There is no
  import cycle — `contact.schema.ts` imports nothing.

**Do not delete `validateContact` (`contact.schema.ts:87-148`).** A4 F1 proposes deleting
it as dead app code, and it is unreferenced by `src/app/**`, but
`tests/contact-step.spec.ts:111-220` is its test suite and those tests are the only
executable coverage of the contact rules in this repository today — see "How to
verify". Deleting the function would delete that coverage. This task keeps it and makes
it the owner of the shared constants; whether the Signal Forms schema should delegate its
whole body to `validateContact` is a larger refactor that is not attempted here.

**5. Tests — `tests/contact-step.spec.ts`,** which runs today.

- `tests/contact-step.spec.ts:333-341` currently asserts the opposite of this fix. Its
  title is "seeds default fixture values that use example.test and a fictitious Hungarian
  address" and it asserts the three strings appear in the step source. Rewrite it: assert
  that the three strings appear as `placeholder` attributes in `contact-step.html`, and
  that the initial model is empty — for example that the step source matches
  `/fullName:\s*''/` and does not match `/fullName:\s*'Teszt Elek'/`.
- Add one assertion that `contact-step.ts` no longer declares its own email or phone
  regex (the source does not match `/const\s+(EMAIL_RFC5322_SUBSET|PHONE_E164)\s*=/`) and
  imports them from `./contact.schema` instead.

## Out of scope

- **`AddressForm` and `DeliveryStep`.** A4 F2 and F3 report the same duplication for the
  address rules (`src/app/features/checkout/address-form.ts:43` re-declares
  `POSTAL_CODE_PATTERN`, `src/app/features/checkout/delivery-step.ts:399-408` re-derives
  all four address bounds) and that `AddressForm`
  does not use Signal Forms although `docs/spec/components.md:585` requires it. None of
  that is touched here; this task is the **contact** rules only.
- The delivery screen's own defects (`FIX-22`).
- `contact-step.html`'s labels, help texts and the H1 (`FIX-35` owns UI copy).
- Moving specs out of `tests/` (`FIX-06`), and the source-text style of the existing
  assertions (`FIX-07`). Edit the tests named above in place, in the style of the file.
- `CheckoutFacade.loadSession`'s unused `clearOnLoad` parameter (A4 F6).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but tests/contact-step.spec.ts must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**Reaching the contact step.** Build the cart by clicking and navigate with in-page links
only: open `http://localhost:4200/telefonok/demo-one-5g`, click "Kosárba teszem", open the
cart through the header cart link, then click `[data-testid="cart-continue"]`. **Never load a
`/penztar/*` URL directly and never reload one** — a full page load of a checkout route
throws the cart away today, which is a real defect owned by `FIX-10`; until it lands, a
check that reloads into a checkout screen is testing the wrong thing.

**The E074 repro**, at 1440, on `/penztar/adatok` reached as above: leave all three fields
empty, click `[data-testid="contact-submit"]`, then read the URL, the DOM and the network
log.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R19 applies and is central**: invalid, default and saving must be distinct, visible
  states on this form.
- **R20 applies**: on an invalid continue, focus must land on the error summary and then
  on the first invalid field, and every message must have an accessible name.
- **R15 applies**: the synthetic-data reminder (`contact-step.html:9-13`) stays visible,
  and the example values must not read as real user data — which is exactly why they
  become placeholders.
- **R24 applies**: a failed save must preserve every entered value.
- **R12 applies**: the Hungarian messages keep their accents.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R11, R13, R14, R16–R18, R21–R23, R25: N/A — this change alters no brand asset,
  layout, image, price, filter state, target size, modal or handoff artefact.

## Acceptance criteria

- [ ] **FIX-20-AC01** On a freshly reached `/penztar/adatok` at 1440, all three inputs
      read empty: `document.querySelector('[data-testid="contact-fullname-input"]').value`
      is `''`, and likewise for the email and phone inputs. Each of the three carries a
      non-empty `placeholder` attribute.
- [ ] **FIX-20-AC02** Clicking `[data-testid="contact-submit"]` with all three fields
      empty leaves `window.location.pathname` at `/penztar/adatok`.
- [ ] **FIX-20-AC03** After that click, `[data-testid="contact-summary"]` is present in
      the DOM and lists one entry per invalid field, and
      `document.activeElement` is either that summary element or
      `#contact-fullname-input`.
- [ ] **FIX-20-AC04** After that click, the network log contains **no**
      `PUT /api/v1/checkout/...` request (E074, "no draft API request"). Capture the
      network log as evidence.
- [ ] **FIX-20-AC05** Filling all three fields with valid values
      (`Teszt Elek` / `teszt@example.test` / `+36201234567`) and clicking the same button
      navigates to `/penztar/szallitas`, proving the fix did not block the happy path.
- [ ] **FIX-20-AC06** `grep -n "EMAIL_RFC5322_SUBSET\|PHONE_E164\|PHONE_INTERNATIONAL\|PHONE_PATTERN" src/app/features/checkout/*.ts`
      shows the email regex literal declared exactly once and the phone regex literal
      declared exactly once, both in `contact.schema.ts`.
- [ ] **FIX-20-AC07** `tests/contact-step.spec.ts` asserts the empty initial model, the
      three placeholders and the absence of the local regex declarations;
      `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/contact-step.spec.ts` instead.
- [ ] **FIX-20-AC08** `npm run build` exits 0.
- [ ] **FIX-20-AC09** The commit body records how the empty-form bypass fell out. With
      the prefill removed, clicking `[data-testid="contact-submit"]` on an empty form
      either navigated — B1's report reproduced — or did not, and the body says which,
      with the screenshot and network log from AC02 and AC04 as the evidence. If it
      reproduced, the body names the cause; the lead recorded at `FIX-20.md:126-133` (the
      shared `Button`'s unbound `type` input, so the CTA never raises the form's native
      submit event) is checked first and the result stated either way. **"Not
      reproduced" is a result and is recorded as one**; leaving the question unanswered
      is not, and this criterion is what `FIX-20.md:79-81`'s *"What settles it is the
      repro in 'How to verify'"* now points at.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. The prefill
removal, the validation behaviour and the rule de-duplication belong together: the first
is what makes the second observable, and the third is the same field rules in the same
three files. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: contact step starts empty and blocks an invalid continue
```
