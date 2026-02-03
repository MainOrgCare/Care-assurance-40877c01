#!/usr/bin/env python3
"""Bump the extension version in manifest.json (patch by default)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "extension" / "edge-acp-autofill" / "manifest.json"


def bump_version(version: str, part: str) -> str:
    nums = version.split(".")
    while len(nums) < 3:
        nums.append("0")
    major, minor, patch = (int(n) for n in nums[:3])
    if part == "major":
        major += 1
        minor = 0
        patch = 0
    elif part == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1
    return f"{major}.{minor}.{patch}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Bump Edge extension manifest version")
    parser.add_argument("--part", choices=["major", "minor", "patch"], default="patch")
    args = parser.parse_args()

    if not MANIFEST.exists():
        raise SystemExit(f"Manifest not found: {MANIFEST}")

    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    current = data.get("version", "0.1.0")
    new_version = bump_version(current, args.part)
    data["version"] = new_version
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Bumped version: {current} -> {new_version}")


if __name__ == "__main__":
    main()
