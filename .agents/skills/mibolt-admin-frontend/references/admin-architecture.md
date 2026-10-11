# Admin architecture

Bootstrap, providers, routing, the session, the interceptors, the state idioms and the styling
setup of `frontend/projects/admin/`. Paths resolve as `SKILL.md` says. Read the cited code before
changing it: the code comments there carry the reasons.

## Contents

1. Bootstrap and environments
2. Providers and the interceptor chain
3. Routes and guards
4. Session, sign-in and the 401 round trip
5. If-Match and Problem handling
6. State idioms
7. Locale, icons and the initial bundle
8. Styling
9. Adding a screen

## 1. Bootstrap and environments

- `frontend/projects/admin/src/main.ts` ("async function bootstrap()") starts the mock worker before
  `bootstrapApplication`, and only when `environment.production` is false and `environment.demo`
  is true. The comment above it (`frontend/projects/admin/src/main.ts`, "Starts the in-page mock
  worker before bootstrap") says why `isDevMode()` is not the switch: the `local-backend`
  configuration is a development build too, and it must not start the worker.
- The environment files in `frontend/projects/admin/src/environments/` carry
  `{ production, demo }`. `frontend/projects/admin/src/environments/environment.ts` is the
  production default. `frontend/angular.json`
  ("projects/admin/src/environments/environment.development.ts") swaps in the mock one for the
  `development` configuration, and `frontend/angular.json`
  ("projects/admin/src/environments/environment.local-backend.ts") the real-backend one for
  `local-backend`, whose dev server proxies `/api` through
  `frontend/proxy.local-backend.conf.json`.
- `frontend/projects/admin/src/app/app.ts` ("export class App") is a bare router outlet. It removes
  the `#mi-bolt-splash` cover with `dismissSplash` from `@mi-bolt/core-api/splash` once the first
  navigation settles, and a guard's redirect does not count as settled
  (`frontend/projects/admin/src/app/app.ts`, "function isSettledNavigation").

## 2. Providers and the interceptor chain

`frontend/projects/admin/src/app/app.config.ts` ("appConfig") is the whole provider list:

- `provideBrowserGlobalErrorListeners()`.
- `provideRouter(routes, withComponentInputBinding())`. Route parameters arrive as component
  inputs, which is how `ProductEditPage` gets `productId`
  (https://angular.dev/api/router/withComponentInputBinding).
- `provideApiConfiguration(resolveApiRoot())`: the admin's own generated configuration, pointed
  at `/api/v1` on the page's origin.
- `provideHttpClient(withInterceptors([ifMatchInterceptor, unauthorizedInterceptor, transportInterceptor]))`,
  the interceptors in this order. `transportInterceptor` stays last so every interceptor before
  it, and HttpClient's own XSRF handling, still sees a request it hands to the XHR backend
  (`frontend/projects/admin/src/app/core/api/transport.interceptor.ts`, "It stays last in").
- `provideAppInitializer(() => inject(AdminSession).refresh())`, so the session is known before
  the first route activates.
- `LOCALE_ID` `hu-HU`.

HttpClient keeps its default fetch backend. The image upload is the one request marked with
`USE_XHR` through `withUseXhr()`, because fetch produces no upload progress events
(https://angular.dev/guide/http/setup#withxhr). `MediaUploader` builds that request with the
generated `RequestBuilder` rather than through the generated `uploadAdminMedia` function, whose
response filter drops the progress events
(`frontend/projects/admin/src/app/shared/image-upload/media-uploader.ts`, "export class
MediaUploader").

## 3. Routes and guards

`frontend/projects/admin/src/app/app.routes.ts` ("export const routes") defines the tree. Every
screen loads lazily, and every title reads `<page> – MiBolt Admin`.

- `/bejelentkezes`, behind `guestOnlyGuard`, loads
  `frontend/projects/admin/src/app/features/login/login.routes.ts`.
- `''` loads the shell, `frontend/projects/admin/src/app/layout/shell.component.ts`, behind
  `adminAuthGuard`, with these children:
  - `''` redirects to `attekintes`;
  - `attekintes` loads `frontend/projects/admin/src/app/features/overview/overview.routes.ts`;
  - `termekek` loads `frontend/projects/admin/src/app/features/products/products.routes.ts`: the
    list at `''`, create at `uj`, edit at `:productId`;
  - `adminok` loads `frontend/projects/admin/src/app/features/admins/admins.routes.ts`.
- `**` redirects to `''`.

The guards:

- `adminAuthGuard` (`frontend/projects/admin/src/app/core/auth/admin-auth.guard.ts`, "export const
  adminAuthGuard") reads `AdminSession.current()` synchronously. When nobody is signed in it returns
  a URL tree to `LOGIN_PATH` with `vissza` set to the URL asked for. It reads `undefined` as signed
  out instead of waiting, because the app initializer has already run.
- `guestOnlyGuard` (`frontend/projects/admin/src/app/core/auth/guest-only.guard.ts`, "export const
  guestOnlyGuard") sends a signed-in admin to `/attekintes`.
- `LOGIN_PATH` and `isLoginPath` live in `frontend/projects/admin/src/app/core/auth/login-path.ts`.

## 4. Session, sign-in and the 401 round trip

`AdminSession` (`frontend/projects/admin/src/app/core/auth/admin-session.ts`, "export class
AdminSession") is a `@Service()` root singleton:

- `current` is `undefined` before the first `refresh()`, `null` when nobody is signed in, and the
  `AdminUser` otherwise.
- `refresh()` never rejects. It runs as the app initializer, and a rejected initializer stops the
  app, so every failure reads as signed out.
- `login()` first sends a GET session whose own outcome is ignored, to prime the `XSRF-TOKEN`
  cookie, and only then posts the credentials
  (`frontend/projects/admin/src/app/core/auth/admin-session.ts`, "async login("). A login after a
  logout rotated the token depends on that priming.
- `logout()` reads 204 and 401 alike as signed out and rethrows anything else. `changePassword()`
  never touches `current`.
- `refresh()`'s session read, the priming GET, the login POST and the logout POST carry
  `skipUnauthorizedRedirect()`
  (`frontend/projects/admin/src/app/core/auth/skip-unauthorized-redirect.ts`): their caller
  handles a 401 itself, so the interceptor below must not also navigate
  (`frontend/projects/admin/src/app/core/auth/admin-session.ts`, "caller owns the navigation after a
  logout").

The 401 round trip:

1. `unauthorizedInterceptor`
   (`frontend/projects/admin/src/app/core/auth/unauthorized.interceptor.ts`, "export const
   unauthorizedInterceptor") answers a 401 from any other request by clearing the session and
   navigating to the login page, with `vissza` set to the current URL unless that URL already is the
   login page, where it navigates without `vissza`. It always rethrows, so the caller still sees the
   error.
2. `LoginPage` (`frontend/projects/admin/src/app/features/login/login-page.ts`, "private async
   login()") signs in, then navigates to `vissza` only when `isSafeTarget` accepts it
   (`frontend/projects/admin/src/app/features/login/login-page.ts`, "function isSafeTarget"): a
   same-origin absolute path, no leading `//`, no backslash, not the login route. Anything else goes
   to `/attekintes`. Either way the navigation replaces the history entry.
3. Route every new post-login target through `isSafeTarget`; it is the open-redirect guard.

## 5. If-Match and Problem handling

- The admin has its own `withIfMatch(precondition)` and `ifMatchInterceptor`
  (`frontend/projects/admin/src/app/core/api/if-match.interceptor.ts`, "verbatim into the If-Match
  header"), which copy the given string into `If-Match` verbatim. It does not use the `withIfMatch`
  of `@mi-bolt/core-api`, and the generated client leaves the `If-Match` parameter out
  (`frontend/ng-openapi-gen.admin.json`, "excludeParameters").
- Archive and restore on the list send the row's `version` quoted, `"<version>"`
  (`frontend/projects/admin/src/app/features/products/list/product-list.store.ts`, "private
  rowAction("). The edit page's save does the same with the `version` of the product it last read or
  wrote (`frontend/projects/admin/src/app/features/products/edit/product-edit.store.ts`, "async
  load(productId: number)" and
  `frontend/projects/admin/src/app/features/products/edit/product-edit.store.ts`,
  "async save(input: AdminProductInput)").
- Never copy the `ETag` response header into `If-Match`. Cloudflare, in front of every
  `bolt*.mimukodik.hu` host, weakens a strong `ETag` to `W/"<version>"` when it compresses the
  response, and the API accepts only the strong form, so a copied header fails with 400
  `INVALID_REQUEST` (MIM-453).
- A 412 means someone else saved first. The list answers it with a snack-bar and `retry()`; the
  edit page opens `ConflictDialog`, which compares local and server values and preserves edits. The guarded snapshot updates only the next If-Match version after explicit comparison; another save remains an administrator action.
- `frontend/projects/admin/src/app/core/api/problem.ts` is where a Problem body is read.
  `isProblem` is the type guard; `problemOf(error)` returns the body or `null`, parsing a string
  body first (an operation generated with `responseType: 'text'` leaves the error body as text);
  `fieldErrorsOf(error)` returns the field-error list. Branch on `problemOf(error)?.code` inside
  the store, the way `AdminsStore.delete` separates `ADMIN_SELF_DELETE` from `LAST_ADMIN`
  (`frontend/projects/admin/src/app/features/admins/admins.store.ts`, "async delete(admin:
  AdminUser)").

## 6. State idioms

- Root singletons use `@Service()`: `AdminSession` and `MediaUploader`
  (https://angular.dev/api/core/Service). `mibolt-frontend-code-standards` ("Angular") is where
  the preference is written.
- The product list, the product editor and the admins screen keep their state in an
  `@Injectable()` store that the page lists in its own `providers`, so every route activation gets
  a fresh one: `ProductListStore`
  (`frontend/projects/admin/src/app/features/products/list/product-list-page.ts`, "providers:
  [ProductListStore]"), `ProductEditStore`
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "providers:
  [ProductEditStore, SubmitAttempt, UploadTracker]") and `AdminsStore`
  (`frontend/projects/admin/src/app/features/admins/admins-page.ts`, "providers: [AdminsStore]").
  `SubmitAttempt` and `UploadTracker` are provided per component the same way.
- A store method that calls the backend never rejects. It returns a tagged union that the page
  switches on, such as `DeleteResult`
  (`frontend/projects/admin/src/app/features/admins/admins.store.ts`, "export type DeleteResult"),
  `RowActionResult` (`frontend/projects/admin/src/app/features/products/list/product-list.store.ts`,
  "export type RowActionResult") and `SaveResult`
  (`frontend/projects/admin/src/app/features/products/edit/product-edit.store.ts`, "export type
  SaveResult"), or it sets a status signal. `ProductEditStore.save` throws only when called before
  `load`, which is a programmer error rather than a runtime state.
- `ProductEditStore` bumps a generation counter on every `load()` and ignores a response that
  resolves after a newer load started
  (`frontend/projects/admin/src/app/features/products/edit/product-edit.store.ts`, "#generation =
  0").
- The overview's four cards each hold a `Loadable<T>` with the kinds `loading`, `ready` and
  `error`. The type is local to
  `frontend/projects/admin/src/app/features/overview/overview.component.ts` ("type Loadable<T>"),
  not shared.
- Everything that calls the backend injects `AdminApi` and calls `invoke`, which returns an
  `Observable` of the response body, or `invoke$Response`, which returns an `Observable` of the
  whole response, where a header such as `ETag` matters. The one exception is `MediaUploader`,
  which builds its upload request itself (section 2). Nothing constructs `AdminApi` with `new`.

## 7. Locale, icons and the initial bundle

The `MIM-404` comments record why Angular Material, the shell and the locale data stay out of the
initial bundle. Keep them out:

- `LOCALE_ID` is `hu-HU` app-wide, and the locale data is registered by
  `provideHungarianLocaleData()`
  (`frontend/projects/admin/src/app/core/locale/hungarian-locale.ts`, "function
  provideHungarianLocaleData()") in the `providers` of the routes whose screens format dates:
  `frontend/projects/admin/src/app/features/admins/admins.routes.ts` ("providers:
  [provideHungarianLocaleData()]") and
  `frontend/projects/admin/src/app/features/products/products.routes.ts` ("providers:
  [provideHungarianLocaleData()]"). A new screen that formats dates adds it to its own route.
- `applyMaterialSymbolsFont()` (`frontend/projects/admin/src/app/core/icons/icon-font.ts`, "function
  applyMaterialSymbolsFont()") is called from the login page's and the shell's constructors instead
  of a provider in `frontend/projects/admin/src/app/app.config.ts`, where any import from
  `@angular/material/icon` would land in the initial bundle
  (`frontend/projects/admin/src/app/core/icons/icon-font.ts`, "the whole icon module into the
  initial bundle").
- The shell loads with its route (`frontend/projects/admin/src/app/app.routes.ts`, "loads with this
  route"), and the password-change dialog on first use
  (`frontend/projects/admin/src/app/layout/shell.component.ts`, "async openPasswordChange()").
- The production budget for the initial bundle is 500 kB warning and 1 MB error
  (`frontend/angular.json`, "budgets").

## 8. Styling

- `frontend/projects/admin/src/material-theme.scss` calls `mat.theme()` with the azure primary
  and blue tertiary palettes, Roboto and density 0, and defines `.adm-danger` for destructive
  confirm buttons, since Material 3 has no warn palette.
- `frontend/projects/admin/src/styles.css` imports Tailwind's theme and utilities layers without
  Preflight.
- `frontend/angular.json` ("projects/admin/src/material-theme.scss") loads the theme, the
  self-hosted Roboto and Material Symbols CSS, and the Tailwind file, in that order.
- Templates lay out with Tailwind utility classes, and component styles read Material's system
  variables (`var(--mat-sys-...)`), as
  `frontend/projects/admin/src/app/features/login/login-page.ts` ("var(--mat-sys-error)") does.
- Which design reference governs an admin style value is open; this skill's `SKILL.md` ("Rules
  that bind here") states both sources.

## 9. Adding a screen

1. Create a directory under `frontend/projects/admin/src/app/features/` with a routes file that
   exports a `Routes` constant, shaped like
   `frontend/projects/admin/src/app/features/admins/admins.routes.ts`: `loadComponent`, a title
   ending in ` – MiBolt Admin`, and `provideHungarianLocaleData()` in `providers` if the screen
   formats dates.
2. Add it as a `loadChildren` child of the shell route in
   `frontend/projects/admin/src/app/app.routes.ts` ("children: ["), so `adminAuthGuard` covers it.
3. Add its link to the side navigation in
   `frontend/projects/admin/src/app/layout/shell.component.html` ("<mat-nav-list>").
4. Put its state in an `@Injectable()` store listed in the page's `providers`, with methods that
   never reject.
5. Add mock handlers for any endpoint the admin mocks do not answer yet, and specs for the page,
   the store and the handlers.
