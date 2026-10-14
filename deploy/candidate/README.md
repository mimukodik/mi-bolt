# Candidate build and publication

`Candidate Build` runs on pull requests and `main` without deployment or
registry write credentials. It computes one SHA-256 input hash per image from
tracked paths and Git file modes selected by the frontend/backend rules in
`.github/components.yml`, plus the Compose build definition. The trusted hash
code validates those rules against its expected set, so a changed filter
cannot silently omit build inputs. Docker Bake reads `deploy/compose.yaml`
and exports two Docker archives. The build run retains `build.json` and the
archives as a `candidate-build` Actions artifact for seven days.
It runs the focused candidate and chart checks before building. Bake runs from
`deploy/`, so the Compose file's `../` contexts resolve inside the checkout.

`Publish Candidate` runs only from the default branch after a CI or Candidate
Build run completes. It requires either a current open PR or the current `main`
commit, and successful latest CI and build runs for exactly that SHA. Main
releases require `push` runs on `main`; PR releases require `pull_request` runs.
It also checks CI's `ci-ok` job. It downloads the exact build-run artifact, checks its fixed file names,
checks the bounded Compose build contexts, recomputes both input hashes using
trusted publisher code over a separate
read-only PR checkout, and treats image archives as data. PR scripts and chart
templates are never executed in the publisher. A second freshness check runs
before image publication, before chart publication, and before receipt upload.
Automatic publication accepts only same-repository PRs; fork PRs have no
automatic candidate receipt.

Image tags use `sha256-<inputHash>`. An existing tag is pulled and reused with
its original `org.opencontainers.image.revision` build commit; a missing tag is
loaded from the archive and pushed. The receipt always pins the registry image
digests. The publisher packages the trusted default-branch chart with those
digests, the candidate ID, and the full tested head commit. The chart version
includes the publisher run ID, so a rerun creates a distinct OCI tag.

The `candidate-receipt` artifact is `candidate.json`, schema version 1:

```json
{
  "schemaVersion": 1,
  "candidateId": "pr-123-0123456789ab",
  "repo": "mimukodik/mi-bolt",
  "pr": 123,
  "headSha": "<40 hex>",
  "testedSha": "<same 40 hex>",
  "sourceRunId": 1234,
  "ciRunId": 1235,
  "publisherRunId": 1236,
  "publisherRevision": "<trusted default-branch 40 hex>",
  "inputHashes": {"web": "<64 hex>", "commerce": "<64 hex>"},
  "images": {
    "web": {"repository": "ghcr.io/mimukodik/mi-bolt-web", "digest": "sha256:<64 hex>", "inputHash": "<64 hex>", "buildCommit": "<40 hex>"},
    "commerce": {"repository": "ghcr.io/mimukodik/mi-bolt-commerce", "digest": "sha256:<64 hex>", "inputHash": "<64 hex>", "buildCommit": "<40 hex>"}
  },
  "chart": {"repository": "ghcr.io/mimukodik/mi-bolt/charts/mi-bolt", "digest": "sha256:<64 hex>", "revision": "<same trusted default-branch 40 hex>"},
  "templateFingerprint": "<64 hex>"
}
```

`templateFingerprint` is SHA-256 over sorted tracked relative paths and
contents under `backend/services/commerce/src/main/resources/db/` (Liquibase
schema and migrations) and `data/catalog/`. It is recorded as provenance only;
the preview platform does not gate on it. Chart revision and digest identify
the full trusted chart template. The chart's candidate head commit is the
tested PR SHA; its per-image commit annotations preserve each image's original
build commit when a content-hash tag is reused.
The artifact is evidence only when fetched from a successful trusted publisher
run on `main`. The preview platform does not pin publisher revisions; it trusts
any successful `main` run of this workflow, as the stable channel already does
(Berek #153).

## Automatic stable releases

After a merge to `main`, successful matching CI and Candidate Build runs publish
a stable chart version `0.2.<publisher-run-id>`, containing both immutable image
digests. The `stable-release-receipt` artifact uses the same schema with `pr: 0`
and a `main-<sha12>` candidate ID. Berek Flux follows only the stable `0.2.*`
chart channel; PR charts remain in the separate `0.1.0-pr.*` channel.
No additional promotion is required. Superseded main commits are rejected
before publication.

Stable upgrades retain the existing runtime Secret and `mibolt` database. They
apply application migrations without cloning or resetting demo data.
`Stable Smoke` waits for the exact public deployment and runs both checkout
flows, requiring no retries or skips. The deployment counts as exact when web's
`/__candidate.json` matches the receipt and commerce's `/api/v1/actuator/info`
reports the receipt's publisher run. Commerce rolls, so its readiness alone
can come from the previous release's pod. Both journeys buy only the hidden
`mi-bolt-smoke-canary` fixture, never a catalogue phone; a missing fixture fails
the run without a fallback. Demo/preview charts enable `MIBOLT_SMOKE_ENABLED`.
The backend seeds the fixture idempotently even in an already populated database
and restores its stock inside the order transaction. Demo orders remain, but
repeated or interrupted smoke runs do not consume real catalogue stock. Existing
depleted phone stock is not reset by this change. Failure
is reported after deployment; it does not automatically roll back migrations.

To freeze or roll back the application, replace the OCI source semver selector
in Berek with a reviewed chart digest. The chart contains the paired images.
Only roll back to a version compatible with the current database schema.
Restore the semver selector to resume automatic releases.

Run local checks with:

```sh
uv run --no-project --with PyYAML==6.0.2 python deploy/tests/test-candidate.py
uv run --no-project python deploy/tests/test-github-deployment.py
actionlint -ignore 'label "blacksmith-2vcpu-ubuntu-2404" is unknown' \
  .github/workflows/candidate.yml .github/workflows/publish-candidate.yml \
  .github/workflows/preview-deployment.yml
```

PR CI runs the PR's own E2E and real-stack smoke with the PR's tests. A preview
is available at `https://bolt-pr-<PR-number>.mimukodik.hu` once the
`bolt-preview` label is on and the published candidate is ready. The existing
MIM-271 suite remains available for optional manual checks against that URL.
Stable acceptance continues through `Stable Smoke` after merge.
PR-controlled npm lifecycle hooks and modified tests never execute in the
receipt-producing publisher workflow.

## Waiting for a preview

Adding the label is what deploys the preview. The Berek coordinator holds only
a read-only GitHub token, so the `Preview Deployment` workflow
(`.github/workflows/preview-deployment.yml`) reports the rollout on the PR as
the `preview-pr-<PR-number>` deployment: in progress from the label or a push,
then the preview URL once the host serves the head, or the reason it did not.
Removing the label or closing the PR marks it inactive. It runs
`deploy/candidate/github_deployment.py` from the default branch, which waits
with `preview_wait.py`. A preview that was running before the workflow saw
its label or push gets its deployment from a manual run, and the same run
reports a preview again after its CI was re-run or a wait timed out, since
neither starts the workflow:

```sh
gh workflow run preview-deployment.yml -R mimukodik/mi-bolt -f pr=<PR-number>
```

To wait for the preview from a shell:

```sh
gh pr edit <PR-number> --add-label bolt-preview
python3 deploy/candidate/preview_wait.py <PR-number>
```

It needs `gh` with read access to the repository's pull requests and Actions
runs, and Python 3 with no packages. It prints one line per state change: the
head's `CI` and `Candidate Build` runs, then what the preview host serves. It
exits 0 and prints the URL once `/__candidate.json` names the PR head,
readiness is `UP` and commerce reports the same publisher run. It exits 1 when
either run on the head failed, naming the failed jobs; 2 when the PR is
closed, from a fork or not labelled; 3 after `--timeout-minutes` (default 45);
and 4 when GitHub stays unreadable for about two minutes. A new push is
followed to its head.

A timeout names a cause GitHub shows, such as all eight preview slots being
taken; a ninth labelled PR waits for a slot, so remove the label from a PR
whose preview is no longer needed. Otherwise only the coordinator's log says
why a PR waits.

## The label is the only switch

Label on means a preview, label off means none:

- Adding `bolt-preview` deploys the PR's preview once its candidate is
  published.
- Removing it drops the preview and its database.
- Merging or closing the PR removes the label: the `Preview Label` workflow
  (`.github/workflows/preview-label.yml`) does it from the default branch.
  The Berek coordinator drops a closed PR's preview either way.

Nothing expires: a preview stays until its label goes, so remove the label
when the preview is no longer needed; eight run at a time. A push replaces the
preview with one for the new head, on a fresh database. Adding the label again
starts a fresh preview, for the same head too, including after a close and
reopen, as long as the head's candidate is recent: the coordinator looks
through the latest 100 successful `Publish Candidate` runs, roughly ten days.
For an older head, push a commit.

## First deployment and troubleshooting

The first rollout needs an open same-repository PR after the publisher workflow
has landed on `main`. A successful build of `main`, or of a PR that has already
closed, does not publish a preview candidate. Keep the verification PR open
while checking its preview. Add the
`bolt-preview` label on the PR to enable its preview at
`https://bolt-pr-<PR-number>.mimukodik.hu`. Remove the label to clean up the
release and its database; adding it again creates a fresh empty database.
Closing the PR also requests cleanup and removes the label.
Build and publication still run for unlabeled PRs so the candidate receipt is
ready when deployment is enabled.

Use the PR's current head to find the matching `CI` and `Candidate Build` runs,
then inspect `Publish Candidate` and its `candidate-receipt` artifact. A green
publisher run can be a deliberate no-op when the eligibility checks do not
match; the receipt is the evidence that publication actually happened.

The expected URL is `https://bolt-pr-<PR-number>.mimukodik.hu`. Its
`/__candidate.json` must match the receipt's head, publisher run ID and both
image digests. To check the two purchase flows manually, run:

```sh
E2E_BASE_URL=https://bolt-pr-<PR-number>.mimukodik.hu npm --prefix frontend run e2e:smoke
```

If a manual check starts before the candidate is ready, wait until the public
candidate marker and readiness endpoint match, then rerun the same command.

Each new PR head receives a fresh, empty database; the commerce image applies
its migrations, loads the catalogue from the image and bootstraps the admin
account at boot, so the PR's own schema and catalogue are what its preview
runs. Retrying the same head keeps its database. Stable releases to
`https://bolt.mimukodik.hu` deploy automatically after main CI and preserve
the stable database. Database bootstrap, platform configuration,
capacity/expiry, and explicit stable resets belong to Berek's
[`docs/mibolt-preview-release.md`](https://github.com/mimukodik/berek/blob/main/docs/mibolt-preview-release.md).
