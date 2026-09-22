# MiBolt

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Local backend

`npm start` always runs on the in-page mock (MSW); the real Spring backend is a separate configuration. With the backend repository checked out next to this one (or `MIBOLT_BACKEND_DIR` pointing at it; a git worktree of this repository is not next to it, so set the variable there), in three terminals:

```bash
npm run backend:db        # PostgreSQL 16 in Docker on port 55433 (scripts/local-database-docker.sh start)
npm run backend:start     # ./gradlew bootRun in the backend repository, port 8080
npm run start:local-backend
```

`start:local-backend` serves the `local-backend` configuration: `environment.local-backend.ts` replaces `environment.ts` (`demo: false`, so the mock worker stays off) and `proxy.local-backend.conf.json` forwards `/api` to `http://localhost:8080` and `/demo-fizetes` to the payment app on 4210. Stop the database with `npm run backend:db:stop`.

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

`.github/workflows/pr-check.yml` runs lint and format, unit tests with coverage (summary in the job summary, report as the `coverage-unit` artifact), the production build and the API client drift check in parallel on every pull request and push to `main`, on Blacksmith runners. There is no end-to-end suite in this project by decision (2026-09-20).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
