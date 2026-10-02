# MiBolt app chart

The chart enables `MIBOLT_SMOKE_ENABLED` for repeatable checkout smoke. The
backend bootstraps a dedicated synthetic canary even on a populated database;
it is omitted from public catalogue lists and its stock is replenished inside
the order transaction. Normal catalogue stock and existing orders are preserved.
Old commerce images ignore this additive environment variable.

This chart installs the web and commerce apps into a namespace prepared by the
preview platform. It creates two Deployments, two ClusterIP Services, a public candidate receipt
ConfigMap, and one Traefik Ingress. The Ingress sends every path, including `/api/v1`, to web;
web's NGINX serves the storefront at `/`, admin at `/admin/`, payment at
`/demo-fizetes/`, and proxies `/api/` to commerce through `BACKEND_ORIGIN`.

Run `mise run deploy:check` from the repository root to lint the chart, inspect
rendered resources, and check required-value rejection with synthetic digests.

The caller must provide a reachable PostgreSQL database and an existing
Kubernetes Secret named by `commerce.existingSecret`. That Secret must contain
`MIBOLT_DB_URL`, `MIBOLT_DB_USER`, `MIBOLT_DB_PASSWORD`,
`MIBOLT_ADMIN_INITIAL_PASSWORD`, `MIBOLT_DEMO_USERNAME`, and
`MIBOLT_DEMO_PASSWORD`. The chart does not store their values. It also expects
an existing TLS Secret named by `ingress.tlsSecretName`, and any needed image
pull Secret listed under `imagePullSecrets`. The namespace, database, Secrets,
and DNS record are platform responsibilities.

Supply both image repositories and full `sha256:` digests. `candidate.id` is a
Kubernetes label; `candidate.headCommit` is the tested PR head.
`candidate.webCommit` and `candidate.commerceCommit` are
40-character Git commits recorded as annotations. Set `publicOrigin` to the
single HTTPS origin for `ingress.host`, without a trailing slash. The chart
derives both payment URLs from that origin. Values validation rejects absent
digests, malformed origins and hosts, or commerce replicas other than one.

Local rendering example (deployment is performed by Flux in Berek):

```sh
helm template pr-123 ./deploy/helm/mi-bolt \
  --namespace bolt-previews \
  --set candidate.id=pr-123 \
  --set candidate.publisherRunId=123 \
  --set candidate.headCommit=cccccccccccccccccccccccccccccccccccccccc \
  --set candidate.webCommit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --set candidate.commerceCommit=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --set web.image.repository=ghcr.io/example/mi-bolt-web \
  --set web.image.digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --set commerce.image.repository=ghcr.io/example/mi-bolt-commerce \
  --set commerce.image.digest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --set commerce.existingSecret=mi-bolt-runtime \
  --set publicOrigin=https://pr-123.example.test \
  --set ingress.host=pr-123.example.test \
  --set ingress.tlsSecretName=pr-123-tls
```

Commerce has one replica because admin sessions live in its process. Its
`RollingUpdate` strategy uses `maxUnavailable: 0` and `maxSurge: 1`: the old
pod keeps serving while the new pod migrates and loads the catalogue. The
readiness probe admits the new pod only after startup runners finish; then
the old pod stops. The cluster must have capacity for the extra commerce pod.

Commerce and web both wait 5 s in a `preStop` hook before their process stops.
A stopping pod leaves the Service endpoints and Traefik's backends
asynchronously, and it keeps receiving requests until that removal lands; the
5 s normally covers it. Without the wait, the old commerce refused those
requests (web's proxy answered 502), and requests sent to the old web pod
failed with 502 or hung.

Migrations must be additive and compatible with the previous revision's reads
and writes. Hibernate validates mapped columns and ignores added, unmapped
columns. Drops, renames, incompatible type changes or stricter constraints
need expand/contract across releases; see
[`backend/docs/04-adatbazis.md` §5](../../../backend/docs/04-adatbazis.md#5-migráció).
A rollback must also remain compatible with the migrated schema.

Process-local admin sessions are lost on every release and may fail while
both pods serve traffic. For demo step 7, wait for the old pod to disappear,
then log in to the stable admin again. Liveness checks the app process;
web's probe uses the static `/robots.txt` file. This chart does not provision
a database, certificates, or platform controllers.

For stable acceptance, start a catalogue API probe through
`https://bolt.mimukodik.hu` at five requests per second before the Helm
upgrade, using the demo gate's cookie. Keep it running until both old pods
are gone. Record the release revision, probe start/end times, total
requests, successes and failures; acceptance requires zero failures across
that entire window. A rendered chart or a post-release smoke pass alone does
not prove release continuity.
