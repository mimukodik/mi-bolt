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
Build run completes. It requires a current open PR and the latest CI and build
runs for exactly its head SHA to have succeeded; it also checks CI's `ci-ok`
job. It downloads the exact build-run artifact, checks its fixed file names,
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

The template fingerprint is SHA-256 over sorted tracked relative paths and
contents under `backend/services/commerce/src/main/resources/db/` (Liquibase
schema and migrations) and `data/catalog/`. Chart revision and digest identify
the full trusted chart template. The chart's candidate head commit is the
tested PR SHA; its per-image commit annotations preserve each image's original
build commit when a content-hash tag is reused.
The artifact is evidence only when fetched from a successful trusted publisher
run whose revision is allowlisted by the preview platform. Promotion reuses
the chart and image digests recorded here, without rebuilding them.

Run local checks with:

```sh
uv run --no-project --with PyYAML==6.0.2 python deploy/tests/test-candidate.py
actionlint -ignore 'label "blacksmith-2vcpu-ubuntu-2404" is unknown' \
  .github/workflows/candidate.yml .github/workflows/publish-candidate.yml
```

External acceptance runs the existing MIM-271 smoke suite from the separately
approved smoke workflow revision. PR-controlled npm lifecycle hooks and modified tests never
execute in the receipt-producing workflow. PR test changes still run in ordinary
read-only CI; changing the deployed acceptance suite requires approving a new
publisher revision. The platform separately approves wrapper revisions; a newer approved wrapper
can retry an older candidate using its own approved baseline suite.

## First deployment and troubleshooting

The first rollout needs an open same-repository PR after the publisher workflow
has landed on `main`. A successful build of `main`, or of a PR that has already
closed, does not publish a preview candidate. Keep the verification PR open,
preferably as a draft, until its deployed browser checks finish. Run the manual
`Toggle Bolt Preview` Actions workflow with its PR number and `enable` to add
the `bolt-preview` label. The coordinator admits only labeled PRs. Run it with
`disable` to remove the label and clean up the release and cloned database;
enabling the same head again creates a fresh clone. Closing the PR also requests
cleanup. Build and publication still run for unlabeled PRs so the candidate
receipt is ready when deployment is enabled.

Use the PR's current head to find the matching `CI` and `Candidate Build` runs,
then inspect `Publish Candidate` and its `candidate-receipt` artifact. A green
publisher run can be a deliberate no-op when the eligibility checks do not
match; the receipt is the evidence that publication actually happened.

The expected URL is `https://bolt-pr-<PR-number>.mimukodik.hu`. Its
`/__candidate.json` must match the receipt's head, publisher run ID and both
image digests. Readiness alone does not mean browser acceptance: wait for the
`Preview Smoke` workflow and its `preview-smoke-receipt` artifact as well.
If platform activation or admission took longer than the initial smoke wait,
retry the successful publisher run explicitly:

```sh
gh workflow run preview-smoke.yml --repo mimukodik/mi-bolt \
  -f publisher_run_id=<successful-publisher-run-id>
```

Each new PR head receives a fresh template database. Retrying the same head
preserves its current clone. Schema or catalogue changes need a newly approved
template fingerprint in Berek before admission. Stable promotion to
`https://bolt.mimukodik.hu` reuses the accepted chart and image digests and
preserves the stable database. Database bootstrap, coordinator configuration,
capacity/expiry, and explicit stable resets belong to Berek's
[`docs/mibolt-preview-release.md`](https://github.com/mimukodik/berek/blob/main/docs/mibolt-preview-release.md).
