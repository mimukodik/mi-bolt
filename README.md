# MiBolt

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Local backend

`npm start` always runs on the in-page mock (MSW); the real Spring backend is a separate configuration. With the backend repository checked out next to this one (or `MIBOLT_BACKEND_DIR` pointing at it; a git worktree of this repository is not next to it, so set the variable there), in four terminals:

```bash
npm run backend:db        # PostgreSQL 16 in Docker on port 55433 (scripts/local-database-docker.sh start)
npm run backend:start     # ./gradlew bootRun in the backend repository, port 8080
npm run start:payment     # the demo payment app on its own origin, http://localhost:4210/demo-fizetes/
npm run start:local-backend
```

`start:local-backend` serves the `local-backend` configuration: `environment.local-backend.ts` replaces `environment.ts` (`demo: false`, so the mock worker stays off) and `proxy.local-backend.conf.json` forwards `/api` to `http://localhost:8080`. The backend hands the shop an absolute `redirectUrl` on `http://localhost:4210` (MIM-251: the payment gateway is a separate origin, as a real one is), so the browser leaves the shop for the payment dev server, whose `proxy.payment.conf.json` forwards its `/api` calls to the same backend; `returnUrl` brings it back to `http://localhost:4200/penztar`. With `npm start` (MSW) both apps stay on 4200: the mock's URLs are relative and `proxy.conf.json` reaches the payment app through `/demo-fizetes`. Stop the database with `npm run backend:db:stop`.

The built apps run on the real backend with two static hosts: `npx ng build --configuration local-backend`, `npm run build:payment`, then `MI_BOLT_API_PROXY=http://localhost:8080 PORT=4200 node scripts/serve-static.mjs` for the shop and `MI_BOLT_PAYMENT_ONLY=1 MI_BOLT_PAYMENT_STATIC_DIR=dist/demo-payment/browser MI_BOLT_API_PROXY=http://localhost:8080 PORT=4210 node scripts/serve-static.mjs` for the payment app. The backend's demo script (mi-bolt-backend `scripts/demo-stack.sh`) does these steps.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Continuous integration

`.github/workflows/pr-check.yml` runs lint and format, unit tests with coverage (summary in the job summary, report as the `coverage-unit` artifact), the production build and the API client drift check in parallel on every pull request and push to `main`, on Blacksmith runners. The `e2e` job is a six-cell matrix, one job per browser (Chromium, Firefox, WebKit) and viewport (Full HD, mobile), each running its `integration-*` Playwright project in parallel; the Chromium cells collect V8 coverage and fail below the `angular.json` thresholds through the `onEnd` hook in `playwright.config.ts`; `e2e-report` merges the six blob reports into one HTML report. Both jobs are skipped until the first end-to-end spec lands.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
