# Images, NGINX and the Helm chart

Every path is relative to the repository root. `deploy/candidate/README.md`
owns candidate publication and promotion, and `deploy/helm/mi-bolt/README.md`
owns the chart's platform contract; this file is what a change to either image
or to the chart has to keep in step.

## Contents

- [The two images](#the-two-images)
- [The web image's NGINX](#the-web-images-nginx)
- [What pins the Compose build definition](#what-pins-the-compose-build-definition)
- [The Helm chart](#the-helm-chart)
- [The deploy checks](#the-deploy-checks)
- [An environment variable, end to end](#an-environment-variable-end-to-end)

## The two images

**Build both through Compose.** Each reads named build contexts that
`deploy/compose.yaml` supplies through `additional_contexts`
(`deploy/compose.yaml:30-35`, `deploy/compose.yaml:60-63`;
https://docs.docker.com/reference/compose-file/build/), and
`frontend/Dockerfile:3-6` says that a plain `docker build frontend/` cannot
build it. `docker build` takes them as `--build-context name=path` as well
(https://docs.docker.com/reference/cli/docker/buildx/build/), which is how
`backend/docs/06-uzembe-helyezes.md:49-56`, in Hungarian, builds the backend
image by hand; the candidate pipeline builds only from `deploy/compose.yaml`
(`.github/workflows/candidate.yml:51-60`).

- **`mi-bolt-web`**, `frontend/Dockerfile`. The build stage runs `npm ci`,
  copies the `catalog` context's `catalog.json` to where the admin mock seed
  imports it from, builds the storefront, the payment app and the admin in
  their `production` configuration, and runs `check-dist-free-of.mjs` on all
  three so no MSW code ships (`frontend/Dockerfile:7-19`). The runtime stage is
  `nginxinc/nginx-unprivileged` and places the storefront at `/`, the admin at
  `/admin/` and the payment app at `/demo-fizetes/`, plus the NGINX template,
  the security-header snippet and `robots.txt` (`frontend/Dockerfile:21-33`).
  `frontend/.dockerignore` keeps `node_modules/`, `dist/` and the report
  directories out of the context.
- **`mi-bolt-commerce`**, `backend/services/commerce/Dockerfile`. The context
  is `backend/`; the contract comes in as the `contracts` context and is placed
  three levels above `services/commerce`, as in the repository
  (`backend/services/commerce/Dockerfile:1-6`,
  `backend/services/commerce/Dockerfile:14`). The builder runs `bootJar` and
  splits the jar into Spring Boot's layers; the runtime stage copies the four
  layers, the `catalog` context, and sets `MIBOLT_CATALOG_PATH`
  (`backend/services/commerce/Dockerfile:22-31`).

Every base image is pinned by digest, and so is PostgreSQL in
`deploy/compose.yaml:10`.

## The web image's NGINX

**`frontend/nginx/default.conf.template` is rendered at container start, and
only `${BACKEND_ORIGIN}` in it is an environment variable**
(`frontend/nginx/default.conf.template:1`). The upstream image renders every
`/etc/nginx/templates/*.template` file with `envsubst` into `/etc/nginx/conf.d`
(https://hub.docker.com/_/nginx, "Using environment variables in nginx
configuration"); the unprivileged image's README defers to those upstream docs
for usage and listens on 8080
(https://github.com/nginx/docker-nginx-unprivileged). Every other `$` in the
template is an NGINX variable, not an environment variable.

What the template does, with the reason each rule carries:

- `/api/` is proxied to `${BACKEND_ORIGIN}` with gzip off, because gzip turns
  the backend's strong `ETag` into a weak one, which the contract's `If-Match`
  pattern rejects (`frontend/nginx/default.conf.template:14-23`, the case in
  `frontend/tests/web-image/nginx-api-gzip.spec.ts:1-12`); the request body
  limit there is 2 MB.
- Hashed build output under the three app paths is cached as immutable
  (`frontend/nginx/default.conf.template:25-30`); any other file with an
  extension revalidates and a missing one is a 404, never `index.html`
  (`frontend/nginx/default.conf.template:32-37`).
- `/admin/`, `/demo-fizetes/` and `/` each fall back to their own `index.html`
  (`frontend/nginx/default.conf.template:39-55`).
- Every location except `/api/`, whose headers are the backend's
  (`frontend/nginx/default.conf.template:14`), includes
  `frontend/nginx/security-headers.conf`, which sets the CSP, `nosniff`, the
  referrer policy and `X-Robots-Tag`; `frontend/nginx/robots.txt` disallows
  every path.

**Two specs read these files as text**, without a server:
`frontend/tests/web-image/nginx-api-gzip.spec.ts` asserts the `/api/` block
turns gzip off, and `frontend/tests/web-image/nginx-robots.spec.ts` asserts the
robots file, its place in `frontend/Dockerfile`, the snippet's `X-Robots-Tag`,
and that every location outside `/api/` includes the snippet.
`npm --prefix frontend run test:contract` runs them, because its config
collects `tests/**/*.spec.ts` (`frontend/vitest.contract.config.ts:18`). Change
a template rule and its spec in the same commit.

## What pins the Compose build definition

The candidate pipeline treats the build definition as a contract. A change to a
`build:` block in `deploy/compose.yaml` touches all of these:

- `deploy/candidate/publish.py:169-184` refuses a web or commerce build whose
  `context`, `dockerfile` or `additional_contexts` differ from the expected
  set. `Publish Candidate` runs the default branch's copy of that file, so a
  pull request that changes a build context is not published until the matching
  `publish.py` change is on `main`.
- `.github/workflows/candidate.yml:51-60` builds with `docker buildx bake` and
  grants each context directory with `--allow fs.read=…`; a new context
  directory needs its own grant there.
- `deploy/tests/test-candidate.py` builds a sandbox from the real
  `deploy/compose.yaml` and asserts that a changed context is refused.
- `deploy/candidate/inputs.py:65-81` hashes every tracked file the `frontend`
  and `backend` path filters match, plus `deploy/compose.yaml`, into each
  image's input hash, so any change there produces a new image tag; the two
  filter lists are themselves pinned at `deploy/candidate/inputs.py:15-20`.

## The Helm chart

**`deploy/helm/mi-bolt/` installs the two apps into a namespace the preview
platform prepares; Flux in the external Berek repository deploys it**
(`deploy/helm/mi-bolt/README.md:1-7`, `deploy/helm/mi-bolt/README.md:29`). It
renders two Deployments, two ClusterIP Services, one ConfigMap and one Traefik
Ingress that sends every path, `/api/v1` included, to `web`.

- **Values.** `deploy/helm/mi-bolt/values.yaml` leaves every required value
  empty, and `deploy/helm/mi-bolt/values.schema.json` rejects a missing digest,
  a malformed origin or host, and a commerce replica count other than one. Helm
  validates the schema on `install`, `upgrade`, `lint` and `template`
  (https://helm.sh/docs/topics/charts/, "Schema Files").
- **Commerce** runs one replica with the `Recreate` strategy, because admin
  sessions live in its process and two revisions must not overlap during a
  migration (`deploy/helm/mi-bolt/README.md:49-51`,
  `deploy/helm/mi-bolt/templates/deployments.yaml:12-13`). It takes its runtime
  variables from the existing Secret named by `commerce.existingSecret` (the
  keys are listed at `deploy/helm/mi-bolt/README.md:12-16`) and gets the two
  payment URL prefixes derived from `publicOrigin`
  (`deploy/helm/mi-bolt/templates/deployments.yaml:44-51`).
- **Web** gets `BACKEND_ORIGIN` pointed at the commerce Service
  (`deploy/helm/mi-bolt/templates/deployments.yaml:127-128`) and probes
  `/robots.txt`.

## The deploy checks

`deploy/tests/` holds six Python checks. CI runs all six, and its commands are
at `.github/workflows/candidate.yml:32-40`; `check-chart.py`,
`test-candidate.py` and `test-stack.py` also state theirs in their docstring.

- `check-chart.py` is the only one with a mise task: `mise run deploy:check`
  (`mise.toml:100-102`). It runs `helm lint` and `helm template` with synthetic
  values, then asserts the exact resource set, the commerce `envFrom` and `env`
  entries, the web `BACKEND_ORIGIN`, the probe paths, the Ingress and TLS shape
  (`deploy/tests/check-chart.py:50-110`), published-version labels, and six
  rejection cases (`deploy/tests/check-chart.py:138-149`). It writes only to a
  temporary directory.
- `test-candidate.py`, `test-stable-release.py`, `test-preview-smoke.py` and
  `test-github-deployment.py` import `inputs.py`, `publish.py`,
  `stable_smoke.py`, `preview_smoke.py` and `github_deployment.py` from
  `deploy/candidate/`; `deploy/candidate/build_metadata.py` has no test.
- `test-stack.py` covers `deploy/stack.sh` in a throwaway git repository with a
  fake Compose wrapper, and never runs Docker
  (`deploy/tests/test-stack.py:1-14`).

**`mise run deploy:check` needs `helm` and `uv` on the PATH.** The root
`mise.toml` pins only Node and Java (`mise.toml:11-13`), and `check-chart.py`
calls `helm` as a subprocess (`deploy/tests/check-chart.py:33-42`). CI installs
Helm v4.2.2 and uv with setup actions (`.github/workflows/candidate.yml:25`,
`.github/workflows/candidate.yml:29-31`). The root task
`mise run deploy:check` is in neither command table, `README.md:352-372` nor
`docs/monorepo.md:30-50`.

`docs/monorepo.md:17` describes `deploy/` as the Compose file and its wrapper;
the chart, the candidate scripts, the checks above and `deploy/stack.sh` sit
there as well.

## An environment variable, end to end

A new backend variable, or a changed one, has a local half and a deployed half.

- **Local:** the `commerce` service's `environment` in `deploy/compose.yaml`
  (`deploy/compose.yaml:40-48`), a commented default in `deploy/.env.example`
  when a developer may override it, and the variable table at
  `backend/README.md:19-31`.
- **Deployed:** a value the platform supplies comes from the runtime Secret,
  so it joins the key list at `deploy/helm/mi-bolt/README.md:12-16`; a value
  the chart derives goes under `env` in
  `deploy/helm/mi-bolt/templates/deployments.yaml:47-51`, and then
  `deploy/tests/check-chart.py:88-94` has to expect it, since it asserts the
  exact `envFrom` and `env` sets.
- **CI:** `.github/workflows/backend.yml:183-185` and
  `.github/workflows/backend.yml:221-222` set the variables the
  `postgres-smoke` job needs, and `.github/workflows/smoke.yml:19-25` sets the
  ones the Compose smoke run needs.
