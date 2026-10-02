"""Render the app chart and check its deployment contract with synthetic values.

Run with: uv run --no-project --with PyYAML==6.0.2 python deploy/tests/check-chart.py
"""

from pathlib import Path
import re
import shutil
import subprocess
import tempfile

import yaml


CHART = Path(__file__).resolve().parents[1] / "helm" / "mi-bolt"
VALUES = {
    "candidate.id": "pr-123",
    "candidate.headCommit": "c" * 40,
    "candidate.publisherRunId": "123",
    "candidate.webCommit": "a" * 40,
    "candidate.commerceCommit": "b" * 40,
    "web.image.repository": "ghcr.io/example/mi-bolt-web",
    "web.image.digest": "sha256:" + "a" * 64,
    "commerce.image.repository": "ghcr.io/example/mi-bolt-commerce",
    "commerce.image.digest": "sha256:" + "b" * 64,
    "commerce.existingSecret": "mi-bolt-runtime",
    "publicOrigin": "https://pr-123.example.test",
    "ingress.host": "pr-123.example.test",
    "ingress.tlsSecretName": "pr-123-tls",
}


def helm(command: str, values: dict[str, str] | None = VALUES, chart: Path = CHART) -> subprocess.CompletedProcess[str]:
    args = ["helm", command]
    if command == "template":
        args.append("pr-123")
    args.append(str(chart))
    if values is not None:
        for key, value in values.items():
            args.extend(["--set" if (key.endswith(".replicas") or key == "candidate.publisherRunId") else "--set-string",
                         f"{key}={value}"])
    return subprocess.run(args, text=True, capture_output=True, check=False)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


lint = helm("lint")
require(lint.returncode == 0, f"helm lint failed:\n{lint.stdout}{lint.stderr}")

render = helm("template")
require(render.returncode == 0, f"helm template failed:\n{render.stderr}")
documents = list(yaml.safe_load_all(render.stdout))
by_kind = {kind: [doc for doc in documents if doc["kind"] == kind]
           for kind in {doc["kind"] for doc in documents}}
require({kind: len(docs) for kind, docs in by_kind.items()}
        == {"Deployment": 2, "Service": 2, "Ingress": 1, "ConfigMap": 1}, "unexpected chart resources")

deployments = {doc["metadata"]["labels"]["app.kubernetes.io/component"]: doc
               for doc in by_kind["Deployment"]}
services = {doc["metadata"]["labels"]["app.kubernetes.io/component"]: doc
            for doc in by_kind["Service"]}
commerce = deployments["commerce"]
web = deployments["web"]
commerce_pod = commerce["spec"]["template"]["spec"]
web_pod = web["spec"]["template"]["spec"]
commerce_container = commerce_pod["containers"][0]
web_container = web_pod["containers"][0]

require(commerce["spec"]["replicas"] == 1, "commerce must have one replica")
require(commerce["spec"]["strategy"] == {
    "type": "RollingUpdate",
    "rollingUpdate": {"maxUnavailable": 0, "maxSurge": 1},
}, "commerce must keep the old pod available until the new pod is ready")
for component, deployment, pod, container in (
    ("commerce", commerce, commerce_pod, commerce_container),
    ("web", web, web_pod, web_container),
):
    require(services[component]["spec"]["type"] == "ClusterIP", f"{component} service type")
    require(services[component]["spec"]["selector"].items()
            <= deployment["spec"]["template"]["metadata"]["labels"].items(),
            f"{component} service selector")
    require("@sha256:" in container["image"], f"{component} image must use digest")
    require(pod["automountServiceAccountToken"] is False, f"{component} service account token")
    require(pod["securityContext"]["runAsNonRoot"] is True, f"{component} must run nonroot")
    require(container["securityContext"]["allowPrivilegeEscalation"] is False,
            f"{component} privilege escalation")

require(commerce_container["envFrom"] == [{"secretRef": {"name": "mi-bolt-runtime"}}],
        "commerce must consume existing runtime Secret")
commerce_env = {entry["name"]: entry["value"] for entry in commerce_container["env"]}
require(commerce_env == {
    "MIBOLT_SMOKE_ENABLED": "true",
    "MIBOLT_PAYMENT_REDIRECT_URL_PREFIX": "https://pr-123.example.test/demo-fizetes/",
    "MIBOLT_PAYMENT_RETURN_URL_PREFIX": "https://pr-123.example.test/penztar?paymentIntentId=",
    "MIBOLT_PUBLISHER_RUN_ID": "123",
}, "payment URLs must use public origin and commerce must know its release")

# Flux passes values as a file, where Helm reads a run id as a float; it must still render
# as the integer the stable smoke fence compares with the receipt.
with tempfile.TemporaryDirectory() as temp:
    values_file = Path(temp) / "values.yaml"
    values_file.write_text(yaml.safe_dump({"candidate": {"publisherRunId": 37049383413}}))
    result = subprocess.run(["helm", "template", "pr-123", str(CHART), "-f", str(values_file),
                             *[arg for key, value in VALUES.items() if key != "candidate.publisherRunId"
                               for arg in ("--set-string" if not key.endswith(".replicas") else "--set",
                                           f"{key}={value}")]],
                            text=True, capture_output=True, check=False)
    require(result.returncode == 0, f"values-file render failed: {result.stderr}")
    rendered = {doc["metadata"]["labels"]["app.kubernetes.io/component"]: doc
                for doc in yaml.safe_load_all(result.stdout) if doc and doc["kind"] == "Deployment"}
    run_env = {entry["name"]: entry["value"]
               for entry in rendered["commerce"]["spec"]["template"]["spec"]["containers"][0]["env"]}
    require(run_env["MIBOLT_PUBLISHER_RUN_ID"] == "37049383413", "large run id must render as an integer")
    require(rendered["commerce"]["metadata"]["annotations"]["mi-bolt.io/publisher-run"] == "37049383413",
            "publisher run annotation must render as an integer")
require(web_container["env"] == [{"name": "BACKEND_ORIGIN",
                                   "value": "http://pr-123-mi-bolt-commerce:8080"}], "web backend proxy")
for probe, path in ((commerce_container["readinessProbe"], "/api/v1/actuator/health/readiness"),
                    (commerce_container["livenessProbe"], "/api/v1/actuator/health/liveness"),
                    (web_container["readinessProbe"], "/robots.txt"),
                    (web_container["livenessProbe"], "/robots.txt")):
    require(probe["httpGet"]["path"] == path, f"probe path {path}")

ingress = by_kind["Ingress"][0]["spec"]
require(ingress["ingressClassName"] == "traefik", "Traefik ingress class")
require(ingress["tls"] == [{"hosts": ["pr-123.example.test"], "secretName": "pr-123-tls"}],
        "existing TLS Secret")
paths = ingress["rules"][0]["http"]["paths"]
require(len(paths) == 1 and paths[0]["path"] == "/" and
        paths[0]["backend"]["service"]["name"] == services["web"]["metadata"]["name"],
        "all public paths must route through web")

# Flux appends an OCI digest as SemVer build metadata to published versions.
# Validate real candidate-shaped versions and truncation at punctuation boundaries.
with tempfile.TemporaryDirectory() as temp:
    packaged_chart = Path(temp) / "mi-bolt"
    shutil.copytree(CHART, packaged_chart)
    metadata = yaml.safe_load((packaged_chart / "Chart.yaml").read_text())
    versions = (
        "0.1.0-pr.pr.345.893ad1633cb1.run.36012105446+f69bbcd8c634",
        "0.1.0-" + "a" * 48 + ".b",
        "0.1.0-" + "a" * 48 + "+b",
    )
    for version in versions:
        metadata["version"] = version
        (packaged_chart / "Chart.yaml").write_text(yaml.safe_dump(metadata))
        result = helm("template", chart=packaged_chart)
        require(result.returncode == 0, f"published chart render failed: {result.stderr}")
        for doc in yaml.safe_load_all(result.stdout):
            labels = [doc["metadata"]["labels"]]
            if doc["kind"] == "Deployment":
                labels.append(doc["spec"]["template"]["metadata"]["labels"])
            for group in labels:
                value = group["helm.sh/chart"]
                require(len(value) <= 63 and re.fullmatch(
                    r"[a-zA-Z0-9](?:[-_.a-zA-Z0-9]*[a-zA-Z0-9])?", value) is not None,
                    f"invalid chart label for published version: {value}")

for description, values in (
    ("missing required values", None),
    ("missing image digest", {**VALUES, "web.image.digest": ""}),
    ("insecure public origin", {**VALUES, "publicOrigin": "http://pr-123.example.test"}),
    ("mismatched ingress host", {**VALUES, "ingress.host": "other.example.test"}),
    ("two commerce replicas", {**VALUES, "commerce.replicas": "2"}),
    ("missing runtime Secret name", {**VALUES, "commerce.existingSecret": ""}),
):
    result = helm("template", values)
    require(result.returncode != 0, f"chart accepted {description}")

print("chart check passed: rendered resources, published version labels and six rejection cases")
