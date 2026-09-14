#!/usr/bin/env python3
"""Validate this MiBolt skill package using only the Python standard library.

This is deliberately a package-specific check, not a complete YAML, DTCG,
Agent Skills, browser, accessibility or LLM-behavior validator.
Read-only; no network access. Python 3.10+.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import unquote


class ValidationError(ValueError):
    """A package invariant failed."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def flatten(data: dict[str, Any], prefix: tuple[str, ...] = ()) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for key, value in data.items():
        if key.startswith("$"):
            continue
        require(isinstance(value, dict), f"Invalid token group: {'.'.join(prefix + (key,))}")
        name = ".".join(prefix + (key,))
        if "$value" in value:
            result[name] = value
        else:
            result.update(flatten(value, prefix + (key,)))
    return result


def resolve(name: str, tokens: dict[str, dict[str, Any]], seen: tuple[str, ...] = ()) -> Any:
    require(name in tokens, f"Missing alias target: {name}")
    require(name not in seen, f"Alias cycle: {' -> '.join(seen + (name,))}")
    value = tokens[name]["$value"]
    if isinstance(value, str) and value.startswith("{"):
        require(value.endswith("}"), f"Invalid alias: {name}")
        target = value[1:-1]
        require(target in tokens, f"Missing alias target: {target}")
        require(tokens[name]["$type"] == tokens[target]["$type"], f"Alias type mismatch: {name}")
        return resolve(target, tokens, seen + (name,))
    return value


def css_value(token: dict[str, Any]) -> str:
    value, kind = token["$value"], token["$type"]
    if isinstance(value, str) and value.startswith("{"):
        return "var(--mi-bolt-" + value[1:-1].replace(".", "-") + ")"
    if kind == "color":
        return value["hex"]
    if kind in ("dimension", "duration"):
        return str(value["value"]) + value["unit"]
    if kind == "fontFamily":
        return ", ".join('"' + part + '"' if " " in part else part for part in value)
    return str(value)


def luminance(hex_color: str) -> float:
    require(bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", hex_color)), f"Invalid hex color: {hex_color}")
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return sum(channel * weight for channel, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(first: str, second: str) -> float:
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def validate(root: Path) -> dict[str, Any]:
    root = root.resolve()
    checks: list[dict[str, Any]] = []
    details: dict[str, Any] = {}

    def run(name: str, function: Any) -> None:
        try:
            function()
        except (ValidationError, ValueError, OSError, KeyError, TypeError) as error:
            checks.append({"name": name, "status": "FAIL", "error": str(error)})
        else:
            checks.append({"name": name, "status": "PASS"})

    required = [
        "SKILL.md", "README.md", "assets/tokens.json", "assets/tokens.css",
        "assets/reference/manifest.json", "assets/reference/home-orange-hu.png",
        "assets/reference/catalogue-concept-hu.png", "evals/scenarios.json",
        "references/01-visual-foundation.md", "references/02-components.md",
        "references/03-page-recipes.md", "references/04-content-commerce.md",
        "references/05-accessibility-responsive.md", "references/06-workflow-validation.md",
        "references/07-source-notes.md", "scripts/validate.py",
    ]

    def files_check() -> None:
        for item in required:
            path = root / item
            require(path.is_file() and path.stat().st_size > 0, f"Missing or empty file: {item}")
    run("required-files", files_check)

    def frontmatter_check() -> None:
        # Validates only the exact, intentionally simple frontmatter style shipped here.
        text = (root / "SKILL.md").read_text(encoding="utf-8")
        match = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
        require(match is not None, "Missing YAML frontmatter delimiters")
        front = match.group(1)
        name_match = re.search(r"^name: ([a-z0-9-]+)$", front, re.M)
        require(name_match is not None, "Missing supported plain name")
        name = name_match.group(1)
        require(1 <= len(name) <= 64 and not name.startswith("-") and not name.endswith("-") and "--" not in name, "Invalid skill name")
        require(name == root.name, "Name must match parent directory")
        desc_match = re.search(r"^description: >-\n((?:  .*(?:\n|$))+)", front, re.M)
        require(desc_match is not None, "Expected a folded description scalar")
        description = " ".join(line.strip() for line in desc_match.group(1).splitlines())
        require(1 <= len(description) <= 1024, "Description exceeds length limit")
        require(description.startswith("Use when"), "Missing trigger-first description")
        require("Do not apply" in description, "Missing scope boundary")
        metadata = front.split("metadata:\n", 1)
        require(len(metadata) == 2, "Missing metadata")
        for line in metadata[1].splitlines():
            require(bool(re.fullmatch(r'  [a-zA-Z0-9_-]+: "[^"\n]*"', line)), "Metadata must use quoted string values")
        details.update({"skill_name":name, "description_characters":len(description)})
    run("frontmatter-supported-subset", frontmatter_check)

    def line_check() -> None:
        count = len((root / "SKILL.md").read_text(encoding="utf-8").splitlines())
        require(count < 500, f"SKILL.md is too long: {count} lines")
        details["skill_lines"] = count
    run("skill-length", line_check)

    def local_links_check() -> None:
        count = 0
        for path in root.rglob("*.md"):
            for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
                if re.match(r"(?:https?://|mailto:|#)", target):
                    continue
                relative = unquote(target.split("#",1)[0])
                file = (path.parent / relative).resolve()
                require(root in file.parents or file == root, f"Path escapes package: {target}")
                require(file.is_file(), f"Broken local link in {path.name}: {target}")
                count += 1
        details["local_links_checked"] = count
    run("local-markdown-links", local_links_check)

    def rules_check() -> None:
        text = (root / "SKILL.md").read_text(encoding="utf-8")
        ids = re.findall(r"^\| (R\d{2}) \|", text, re.M)
        require(ids == [f"R{i:02}" for i in range(1,27)], "R01-R26 must appear exactly once in rule table")
        details["rule_count"] = len(ids)
    run("rule-identifiers", rules_check)

    def token_check() -> None:
        tokens = flatten(read_json(root / "assets/tokens.json"))
        require(bool(tokens), "No tokens")
        types = {"color", "dimension", "duration", "fontFamily", "fontWeight", "number"}
        for name, token in tokens.items():
            kind = token.get("$type")
            require(kind in types, f"Unsupported token type: {name}")
            value = resolve(name, tokens)
            if kind == "color":
                require(value.get("colorSpace") == "srgb", f"Expected sRGB: {name}")
                components = value.get("components", [])
                require(len(components) == 3 and all(isinstance(c,(int,float)) and math.isfinite(c) and 0 <= c <= 1 for c in components), f"Invalid components: {name}")
                require(value.get("alpha") == 1, f"Expected opaque token: {name}")
                require(bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", value.get("hex", ""))), f"Invalid hex: {name}")
                for component,index in zip(components,(1,3,5)):
                    require(abs(component - int(value["hex"][index:index+2],16)/255) < 0.000001, f"hex/components mismatch: {name}")
            elif kind in ("dimension", "duration"):
                allowed_units = {"px", "rem"} if kind == "dimension" else {"ms", "s"}
                require(value.get("unit") in allowed_units and isinstance(value.get("value"),(int,float)) and math.isfinite(value["value"]) and value["value"] >= 0, f"Invalid dimension/duration: {name}")
            elif kind == "fontFamily":
                require(isinstance(value,list) and bool(value) and all(isinstance(v,str) and v for v in value), f"Invalid fontFamily: {name}")
            elif kind == "fontWeight":
                require(isinstance(value,(int,float)) and 1 <= value <= 1000, f"Invalid fontWeight: {name}")
            else:
                require(isinstance(value,(int,float)) and math.isfinite(value), f"Invalid number: {name}")
        details["token_count"] = len(tokens)
    run("token-values-and-aliases", token_check)

    def css_check() -> None:
        tokens = flatten(read_json(root / "assets/tokens.json"))
        declarations = re.findall(r"^\s*(--mi-bolt-[A-Za-z0-9-]+):\s*([^;]+);", (root / "assets/tokens.css").read_text(encoding="utf-8"), re.M)
        require(len(declarations) == len(dict(declarations)), "Duplicate CSS variable")
        actual = dict(declarations)
        expected = {"--mi-bolt-" + name.replace(".","-"): css_value(token) for name,token in tokens.items()}
        require(actual == expected, "CSS variables do not match token JSON")
    run("css-token-parity", css_check)

    def contrast_check() -> None:
        tokens = flatten(read_json(root / "assets/tokens.json"))
        color = lambda name: resolve(name, tokens)["hex"]
        pairs = [
            ("color.text.primary","color.surface.page",4.5),
            ("color.text.secondary","color.surface.page",4.5),
            ("color.text.secondary","color.surface.subtle",4.5),
            ("button.primaryText","button.primaryBackground",4.5),
            ("button.primaryText","color.brand.accentHover",4.5),
            ("color.brand.ink","color.surface.page",4.5),
            ("color.text.inverse","color.surface.dark",4.5),
            ("color.text.inverseMuted","color.surface.dark",4.5),
            ("color.border.control","color.surface.page",3),
            ("color.focus.light","color.surface.page",3),
            ("color.focus.dark","color.surface.dark",3),
            ("color.status.error","color.surface.page",4.5),
            ("color.status.success","color.surface.page",4.5),
        ]
        results = []
        for foreground,background,minimum in pairs:
            ratio = contrast(color(foreground),color(background))
            results.append({"foreground":foreground,"background":background,"ratio":round(ratio,4),"minimum":minimum})
            require(ratio >= minimum, f"Contrast below target: {foreground}/{background}: {ratio}")
        # Negative control: the original bright-orange/white combination must fail.
        rejected = contrast("#FFFFFF",color("color.brand.accent"))
        require(rejected < 4.5, "Negative contrast control unexpectedly passed")
        details["contrast_pairs"] = results
        details["rejected_white_on_orange_ratio"] = round(rejected,4)
    run("specified-contrast-pairs", contrast_check)

    def image_check() -> None:
        images = read_json(root / "assets/reference/manifest.json")["images"]
        require(len(images) == 2, "This package should contain exactly two reference images")
        require(images[0]["status"] == "approved-primary", "Home must be primary reference")
        require(images[1]["status"] == "secondary-unapproved-concept", "Catalogue must remain secondary concept")
        for image in images:
            path = (root / image["path"]).resolve()
            require(root in path.parents, "Image path escapes root")
            data = path.read_bytes()
            require(data.startswith(b"\x89PNG\r\n\x1a\n"), "Reference is not a PNG")
            require(hashlib.sha256(data).hexdigest() == image["sha256"], f"Reference hash mismatch: {image['path']}")
        details["reference_images"] = len(images)
    run("reference-images-and-hashes", image_check)

    def eval_check() -> None:
        data = read_json(root / "evals/scenarios.json")
        require(data["status"] == "not-run-on-llm", "Do not claim LLM execution in scenario specification")
        cases = data["cases"]
        require(len(cases) == 18 and len({c["id"] for c in cases}) == 18, "Expected 18 unique cases")
        for case in cases:
            require(case["kind"] in {"trigger","negative-trigger","pressure","application"}, f"Invalid case kind: {case['id']}")
            require(bool(case["prompt"]) and bool(case["expected"]), f"Empty case: {case['id']}")
        details["evaluation_cases"] = len(cases)
    run("evaluation-specification", eval_check)

    def packaging_check() -> None:
        excluded = {".woff", ".woff2", ".ttf", ".otf", ".env", ".pyc"}
        bad = [str(path.relative_to(root)) for path in root.rglob("*") if path.is_file() and (path.suffix.lower() in excluded or path.name == ".env")]
        require(not bad, f"Unexpected packaged files: {bad}")
        pages = (root / "references/03-page-recipes.md").read_text(encoding="utf-8")
        require("not completed subpages" in pages, "Missing subpage rendering limitation")
        require(len(re.findall(r"^## P\d{2} —",pages,re.M)) == 7, "Expected seven page recipes")
    run("package-scope-and-exclusions", packaging_check)

    return {"status":"PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL", "checks":checks,"details":details,"limitations":["Not a general YAML or DTCG validator","No browser or UI tests executed","No live LLM activation or behavior evaluation","Not a complete WCAG audit"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1],help="Skill directory")
    parser.add_argument("--json",action="store_true",help="Print structured result")
    args = parser.parse_args()
    result = validate(args.root)
    if args.json:
        print(json.dumps(result,ensure_ascii=False,indent=2))
    else:
        for check in result["checks"]:
            print(f"{check['status']}: {check['name']}" + (": " + check["error"] if "error" in check else ""))
        print(f"\n{result['status']}: {sum(c['status'] == 'PASS' for c in result['checks'])}/{len(result['checks'])} package checks")
        print("Scope: static package checks only; no browser, LLM or full WCAG audit.")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
