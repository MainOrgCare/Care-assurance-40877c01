#!/usr/bin/env python3
"""Package the Edge extension into a zip ready for Edge Add-ons upload."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXT_DIR = ROOT / "extension" / "edge-acp-autofill"
DEFAULT_OUT = ROOT / "dist" / "edge-acp-autofill.zip"

EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", "__pycache__"}
EXCLUDE_FILES = {".DS_Store"}


def should_exclude(path: Path) -> bool:
    if path.name in EXCLUDE_FILES:
        return True
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    return False


def package_extension(out_path: Path) -> None:
    if not EXT_DIR.exists():
        raise SystemExit(f"Extension folder not found: {EXT_DIR}")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(EXT_DIR):
            root_path = Path(root)
            dirs[:] = [d for d in dirs if not should_exclude(root_path / d)]
            for file_name in files:
                file_path = root_path / file_name
                if should_exclude(file_path):
                    continue
                arcname = file_path.relative_to(EXT_DIR)
                zf.write(file_path, arcname.as_posix())

    print(f"Packaged: {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Package Edge extension")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output zip path")
    args = parser.parse_args()
    out_path = Path(args.out).resolve()
    package_extension(out_path)


if __name__ == "__main__":
    main()
