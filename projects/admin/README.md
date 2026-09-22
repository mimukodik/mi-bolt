# MiBolt admin

The shop's back-office application, a second Angular application in this
workspace beside `mi-bolt` and `demo-payment`. Selector prefix `adm`, zoneless,
standalone, Angular Material with the `azure-blue` theme, Hungarian locale
(`hu-HU`), `HttpClient` on the XHR backend. It is served under `/admin/` and
built into `dist/admin`. The page is an empty `<router-outlet />` for now; the
shell and the screens are later units.

## Commands

| Command                             | What it does                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run start:admin`               | Dev server on **http://localhost:4220/admin/**, against the in-page mock API                                           |
| `npm run start:admin:local-backend` | Dev server on the same port, proxied by `proxy.local-backend.conf.json` to the Spring backend on http://localhost:8080 |
| `npm run build:admin`               | Production build into `dist/admin`, served from `/admin/`                                                              |
| `npx ng test admin`                 | Unit tests; coverage goes to `coverage/admin`                                                                          |
| `npx ng lint admin`                 | ESLint over `projects/admin/**/*.{ts,html}`                                                                            |

`npm start` (`ng serve`) still serves the shop, and `ng build` still builds it;
the admin application has its own targets.

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
