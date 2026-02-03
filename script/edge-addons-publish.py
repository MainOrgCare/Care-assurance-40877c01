#!/usr/bin/env python3
"""Publish Edge Add-ons update via the v1.1 API (API key + Client ID)."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib import request, error

API_ROOT = "https://api.addons.microsoftedge.microsoft.com/v1"
UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def get_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    return value


def extract_operation_id(location: str) -> str:
    if not location:
        return ""
    match = UUID_RE.search(location)
    if match:
        return match.group(0)
    return location.strip()


def request_json(url: str, headers: dict[str, str]) -> dict:
    req = request.Request(url, headers=headers)
    with request.urlopen(req) as resp:
        data = resp.read().decode("utf-8")
    return json.loads(data) if data else {}


def wait_for_operation(url: str, headers: dict[str, str], label: str, timeout: int, interval: int) -> None:
    start = time.time()
    while True:
        payload = request_json(url, headers)
        status = (payload.get("status") or "").lower()
        if status == "succeeded":
            print(f"{label} succeeded.")
            return
        if status == "failed":
            raise SystemExit(f"{label} failed: {payload}")
        elapsed = time.time() - start
        if elapsed > timeout:
            raise SystemExit(f"{label} timed out after {timeout}s. Last status: {payload}")
        print(f"{label} status: {payload.get('status', 'unknown')} - waiting...")
        time.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish Edge Add-ons update")
    parser.add_argument("--zip", default="dist/edge-acp-autofill.zip", help="Path to extension zip")
    parser.add_argument("--product-id", default=get_env("EDGE_ADDONS_PRODUCT_ID"), help="Edge Add-ons product ID")
    parser.add_argument("--client-id", default=get_env("EDGE_ADDONS_CLIENT_ID"), help="Edge Add-ons client ID")
    parser.add_argument("--api-key", default=get_env("EDGE_ADDONS_API_KEY"), help="Edge Add-ons API key")
    parser.add_argument("--notes", default="", help="Notes for certification")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout seconds per operation")
    parser.add_argument("--interval", type=int, default=10, help="Polling interval seconds")
    args = parser.parse_args()

    product_id = args.product_id or ""
    client_id = args.client_id or ""
    api_key = args.api_key or ""

    if not product_id or not client_id or not api_key:
        raise SystemExit("Missing required credentials. Set EDGE_ADDONS_PRODUCT_ID, EDGE_ADDONS_CLIENT_ID, EDGE_ADDONS_API_KEY.")

    zip_path = Path(args.zip)
    if not zip_path.exists():
        raise SystemExit(f"Zip not found: {zip_path}")

    headers = {
        "Authorization": f"ApiKey {api_key}",
        "X-ClientID": client_id,
    }

    upload_url = f"{API_ROOT}/products/{product_id}/submissions/draft/package"
    try:
        with zip_path.open("rb") as f:
            data = f.read()
        upload_req = request.Request(upload_url, method="POST", data=data)
        upload_req.add_header("Authorization", headers["Authorization"])
        upload_req.add_header("X-ClientID", headers["X-ClientID"])
        upload_req.add_header("Content-Type", "application/zip")
        with request.urlopen(upload_req) as resp:
            location = resp.headers.get("Location", "")
            print(f"Upload accepted. Location: {location}")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        raise SystemExit(f"Upload failed: {exc.code} {exc.reason} {body}")

    operation_id = extract_operation_id(location)
    if not operation_id:
        raise SystemExit("Upload did not return an operation ID.")

    upload_status_url = f"{API_ROOT}/products/{product_id}/submissions/draft/package/operations/{operation_id}"
    wait_for_operation(upload_status_url, headers, "Upload", args.timeout, args.interval)

    notes = args.notes.strip() or get_env("EDGE_ADDONS_NOTES")
    publish_url = f"{API_ROOT}/products/{product_id}/submissions"
    publish_req = request.Request(publish_url, method="POST", data=(notes or " ").encode("utf-8"))
    publish_req.add_header("Authorization", headers["Authorization"])
    publish_req.add_header("X-ClientID", headers["X-ClientID"])
    publish_req.add_header("Content-Type", "text/plain")

    try:
        with request.urlopen(publish_req) as resp:
            publish_location = resp.headers.get("Location", "")
            print(f"Publish accepted. Location: {publish_location}")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        raise SystemExit(f"Publish failed: {exc.code} {exc.reason} {body}")

    publish_operation_id = extract_operation_id(publish_location)
    if not publish_operation_id:
        raise SystemExit("Publish did not return an operation ID.")

    publish_status_url = f"{API_ROOT}/products/{product_id}/submissions/operations/{publish_operation_id}"
    wait_for_operation(publish_status_url, headers, "Publish", args.timeout, args.interval)


if __name__ == "__main__":
    main()
