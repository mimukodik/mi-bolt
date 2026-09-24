"""Write the untrusted build artifact's descriptive metadata."""

import hashlib
import json
import os
from pathlib import Path
import re

from inputs import hashes


output = Path("candidate-build")
source_sha = os.environ["SOURCE_SHA"]
assert re.fullmatch(r"[a-f0-9]{40}", source_sha)
image_hashes = hashes(Path(".").resolve())
archives = {}
for component in ("web", "commerce"):
    archive = output / f"{component}.tar"
    digest = hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()
    archives[component] = {"file": archive.name, "sha256": digest}
metadata = {
    "schemaVersion": 1,
    "repo": os.environ["GITHUB_REPOSITORY"],
    "pr": int(os.environ.get("PR_NUMBER", "0")),
    "headSha": source_sha,
    "sourceRunId": int(os.environ["GITHUB_RUN_ID"]),
    "inputHashes": image_hashes,
    "archives": archives,
}
(output / "build.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n")
