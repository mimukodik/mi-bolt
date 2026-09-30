# MiBolt admin

The shop's back-office application, a second Angular application in this
workspace beside `mi-bolt` and `demo-payment`. Selector prefix `adm`, zoneless,
standalone, Angular Material with the `azure-blue` theme, Hungarian locale
(`hu-HU`), `HttpClient` on the XHR backend. It is served under `/admin/` and
built into `dist/admin`. It has the sign-in page, the shell (side navigation
and the account menu, loaded with its route) and the Áttekintés, Termékek
(list and product editor) and Adminok screens.

## Commands

| Command                             | What it does                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run start:admin`               | Dev server on **http://localhost:4220/admin/**, backed by the in-page mock worker (see "Mock backend" below)           |
| `npm run start:admin:local-backend` | Dev server on the same port, proxied by `proxy.local-backend.conf.json` to the Spring backend on http://localhost:8080 |
| `npm run build:admin`               | Production build into `dist/admin`, served from `/admin/`                                                              |
| `npx ng test admin`                 | Unit tests; coverage goes to `coverage/admin`                                                                          |
| `npx ng lint admin`                 | ESLint over `projects/admin/**/*.{ts,html}`                                                                            |

`npm start` (`ng serve`) still serves the shop, and `ng build` still builds it;
the admin application has its own targets.

## Mock backend

`npm run start:admin` runs on the in-page mock (`src/mocks/browser.ts`); no
Spring backend is needed. Sign in with the development admin account,
`admin` / `mibolt-admin-demo` (`SEED_ADMIN_PASSWORD` in `src/mocks/seed.ts`),
also printed to the browser console once the worker starts. `?mi-scenario=`
selects one of the scenarios in `src/mocks/scenario.ts`'s `SCENARIOS`:
`default`, `empty-catalog`, `list-error`, `save-conflict`, `upload-error`. A
reload resets the mock data, since it lives only in memory for the tab.

## Real backend

`npm run start:admin:local-backend` serves the admin on the same port and
proxies `/api` to the Spring backend on http://localhost:8080
(`proxy.local-backend.conf.json`). Start the backend first, from the
monorepo root:

- `mise run backend:docker` runs the backend in its container, with
  PostgreSQL in its container on 55433;
- `mise run backend` runs it natively (`bootRun`) against the same
  PostgreSQL container.

`mise run dev:docker` (or `mise run dev`) starts that backend together with
the shop, payment and admin dev servers.

The first start on a database with no admin creates one, `admin`, and
prints its password once in the backend log at WARN:
`initial admin created: username=admin password=… (shown once; change it after the first sign-in)`.
For the container, `deploy/compose.sh logs commerce` shows it. Set
`MIBOLT_ADMIN_INITIAL_PASSWORD` (15 to 64 characters) before that first
start to choose the password instead (`backend/README.md`). After signing
in, change it under the account menu's `Jelszó módosítása`.

## Shared Halloween campaign

The product editor's Promotion section edits one shared campaign text and
interval, independently of the product save. Every variant keeps its regular
price and may have a nullable sale price in whole HUF, strictly below the
regular price. Blank sale prices remove the variant discount.

Campaign dates are entered in Europe/Budapest local time and saved as UTC
instants. Ambiguous or nonexistent daylight-saving times are rejected, not
guessed. The campaign has its own version precondition; a conflict keeps the
edits and asks the administrator to reload. No production dates or campaign
prices are seeded in code. Configure an active test campaign through the
preview admin when demonstrating the storefront.

## Fonts

Roboto and Material Symbols are self-hosted from npm
(`@fontsource/roboto`, `material-symbols`) and wired in through the admin
build's `styles` array, so no request leaves for `fonts.googleapis.com`.
`mat-icon` uses them by default through `MAT_ICON_DEFAULT_OPTIONS` in
`src/app/app.config.ts`.

## Layout

- `src/app/app.config.ts` — providers: router, `HttpClient` on XHR, `hu-HU`
  locale, the Material icon font set.
- `src/environments/` — `{ production, demo }` per build configuration.
- `src/material-theme.scss` — the `mat.theme()` call for the `azure-blue`
  palette.
- `src/styles.css` — Tailwind utilities only, without Preflight.
