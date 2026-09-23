# MiBolt

The Angular workspace under `frontend/` was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8. See [`docs/monorepo.md`](docs/monorepo.md) for how this repository is laid out.

## Development server

To start a local development server, run:

```bash
mise run storefront   # the storefront alone on the MSW mock; mise run frontend starts all three apps
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Local backend

`mise run frontend` and `mise run storefront` always run on the in-page mock (MSW); the real Spring backend is a separate configuration. From the repository root, one command starts the database container, the backend natively and the three apps against it; Ctrl+C stops the backend and the apps:

```bash
mise run dev   # PostgreSQL on 55433, the backend on 8080, storefront 4200, payment 4210 (/demo-fizetes/), admin 4220
```

`npm --prefix frontend run start:local-backend` serves the `local-backend` configuration: `environment.local-backend.ts` replaces `environment.ts` (`demo: false`, so the mock worker stays off) and `proxy.local-backend.conf.json` forwards `/api` to `http://localhost:8080`. The backend hands the shop an absolute `redirectUrl` on `http://localhost:4210` (MIM-251: the payment gateway is a separate origin, as a real one is), so the browser leaves the shop for the payment dev server, whose `proxy.payment.conf.json` forwards its `/api` calls to the same backend; `returnUrl` brings it back to `http://localhost:4200/penztar`. With `npm --prefix frontend run start` (MSW) both apps stay on 4200: the mock's URLs are relative and `proxy.conf.json` reaches the payment app through `/demo-fizetes`. Stop the database with `mise run stop`.

The built apps run on the real backend with two static hosts: `npm --prefix frontend exec -- ng build storefront --configuration local-backend`, `npm --prefix frontend run build:payment`, then `MI_BOLT_API_PROXY=http://localhost:8080 PORT=4200 node frontend/scripts/serve-static.mjs` for the shop and `MI_BOLT_PAYMENT_ONLY=1 MI_BOLT_PAYMENT_STATIC_DIR=dist/demo-payment/browser MI_BOLT_API_PROXY=http://localhost:8080 PORT=4210 node frontend/scripts/serve-static.mjs` for the payment app.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
npm --prefix frontend exec -- ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
npm --prefix frontend exec -- ng generate --help
```

## Building

To build the project run:

```bash
npm --prefix frontend run build
```

This will compile the storefront and store the build artifacts in the `frontend/dist/storefront/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm --prefix frontend run test
```

## Continuous integration

`.github/workflows/frontend.yml`, called by `.github/workflows/ci.yml` when a pull request or a push to `main` changes a frontend input path (`.github/components.yml`), runs lint and format, unit tests with coverage (summary in the job summary, report as the `coverage-unit` artifact), the production build and the API client drift check in parallel, on Blacksmith runners. The `e2e` job is a six-cell matrix, one job per browser (Chromium, Firefox, WebKit) and viewport (Full HD, mobile), each running its `integration-*` Playwright project in parallel; the Chromium cells collect V8 coverage and fail below the `angular.json` thresholds through the `onEnd` hook in `playwright.config.ts`; `e2e-report` merges the six blob reports into one HTML report. Both jobs are skipped until the first end-to-end spec lands.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
