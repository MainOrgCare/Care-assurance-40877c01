#!/usr/bin/env python3
"""Publish Edge Add-ons update via the v1.1 API (API key + Client ID)."""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, request

API_ROOT = "https://api.addons.microsoftedge.microsoft.com/v1"
UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
MAX_DESCRIPTION_LENGTH = 132


class PublishError(Exception):
    """Raised when the publish process fails."""


@dataclass(frozen=True)
class PublishConfig:
    zip_path: Path
    product_id: str
    client_id: str
    api_key: str
    notes: str
    timeout: int
    interval: int
    fail_on_in_progress: bool
    dry_run: bool


def log(level: str, message: str) -> None:
    print(f"[{level}] {message}", flush=True)


def info(message: str) -> None:
    log("INFO", message)


def warn(message: str) -> None:
    log("WARN", message)


def fail(message: str) -> None:
    log("ERROR", message)


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


def _format_operation_payload(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    if payload.get("status"):
        parts.append(f"status={payload.get('status')}")
    if payload.get("errorCode"):
        parts.append(f"errorCode={payload.get('errorCode')}")
    if payload.get("message"):
        parts.append(f"message={payload.get('message')}")
    errors = payload.get("errors")
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict) and first.get("message"):
            parts.append(f"firstError={first.get('message')}")
    return "; ".join(parts) if parts else str(payload)


def _decode_http_error_body(exc: error.HTTPError) -> tuple[str, dict[str, Any] | None]:
    raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
    if not raw:
        return "", None
    try:
        parsed = json.loads(raw)
        return raw, parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return raw, None


def _http_error_message(action: str, exc: error.HTTPError) -> str:
    raw, parsed = _decode_http_error_body(exc)
    if parsed:
        return f"{action} failed ({exc.code} {exc.reason}): {_format_operation_payload(parsed)}"
    if raw:
        return f"{action} failed ({exc.code} {exc.reason}): {raw}"
    return f"{action} failed ({exc.code} {exc.reason})"


def request_json(url: str, headers: dict[str, str]) -> dict[str, Any]:
    req = request.Request(url, headers=headers, method="GET")
    try:
        with request.urlopen(req) as resp:
            data = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        raise PublishError(_http_error_message("Status check", exc))
    except error.URLError as exc:
        raise PublishError(f"Status check failed (network error): {exc.reason}")
    if not data:
        return {}
    try:
        payload = json.loads(data)
    except json.JSONDecodeError as exc:
        raise PublishError(f"Status check returned invalid JSON: {exc}")
    if isinstance(payload, dict):
        return payload
    raise PublishError(f"Status check returned unexpected payload type: {type(payload).__name__}")


def _collect_icon_paths(manifest: dict[str, Any]) -> set[str]:
    icon_paths: set[str] = set()
    icons = manifest.get("icons")
    if isinstance(icons, dict):
        for value in icons.values():
            if isinstance(value, str) and value.strip():
                icon_paths.add(value.strip())
    action = manifest.get("action")
    if isinstance(action, dict):
        default_icon = action.get("default_icon")
        if isinstance(default_icon, str) and default_icon.strip():
            icon_paths.add(default_icon.strip())
        if isinstance(default_icon, dict):
            for value in default_icon.values():
                if isinstance(value, str) and value.strip():
                    icon_paths.add(value.strip())
    return icon_paths


def validate_package_manifest(zip_path: Path) -> None:
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            zip_entries = set(archive.namelist())
            with archive.open("manifest.json") as manifest_file:
                manifest_raw = manifest_file.read().decode("utf-8")
    except FileNotFoundError:
        raise PublishError(f"Zip not found: {zip_path}")
    except zipfile.BadZipFile:
        raise PublishError(f"Invalid zip file: {zip_path}")
    except KeyError:
        raise PublishError("Invalid extension package: manifest.json is missing in the zip.")
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        raise PublishError(f"Invalid manifest.json in package: {exc}")
    if not isinstance(manifest, dict):
        raise PublishError("Invalid manifest.json in package: root JSON value must be an object.")

    for key in ("manifest_version", "name", "version", "description"):
        value = manifest.get(key)
        if value is None or str(value).strip() == "":
            raise PublishError(f"Invalid manifest.json: '{key}' is required and cannot be empty.")

    description = str(manifest.get("description", "")).strip()
    if len(description) > MAX_DESCRIPTION_LENGTH:
        raise PublishError(
            f"manifest.json description is {len(description)} characters; "
            f"Edge Add-ons maximum is {MAX_DESCRIPTION_LENGTH}. Shorten it and repackage."
        )

    manifest_version = manifest.get("manifest_version")
    if manifest_version != 3:
        raise PublishError(f"Invalid manifest.json: manifest_version must be 3 (found {manifest_version!r}).")

    for icon_path in _collect_icon_paths(manifest):
        if icon_path not in zip_entries:
            raise PublishError(f"Invalid extension package: icon path '{icon_path}' is referenced but missing from zip.")

    info(
        "Validated extension package "
        f"(version {manifest.get('version')}, description {len(description)}/{MAX_DESCRIPTION_LENGTH} chars)."
    )


def wait_for_operation(
    url: str,
    headers: dict[str, str],
    label: str,
    timeout: int,
    interval: int,
    allowed_failed_codes: set[str] | None = None,
) -> dict:
    start = time.time()
    while True:
        payload = request_json(url, headers)
        status = (payload.get("status") or "").lower()
        if status == "succeeded":
            info(f"{label} succeeded.")
            return payload
        if status == "failed":
            error_code = str(payload.get("errorCode") or "")
            if allowed_failed_codes and error_code in allowed_failed_codes:
                warn(f"{label} returned {error_code}: {payload.get('message', 'No message')}")
                return payload
            raise PublishError(f"{label} failed: {_format_operation_payload(payload)}")
        elapsed = time.time() - start
        if elapsed > timeout:
            raise PublishError(f"{label} timed out after {timeout}s. Last status: {_format_operation_payload(payload)}")
        info(f"{label} status is {payload.get('status', 'unknown')}. Waiting {interval}s before retry.")
        time.sleep(interval)


def _build_auth_headers(config: PublishConfig) -> dict[str, str]:
    return {
        "Authorization": f"ApiKey {config.api_key}",
        "X-ClientID": config.client_id,
        "Accept": "application/json",
        "User-Agent": "care-assurance-edge-publisher/1.0",
    }


def upload_package(config: PublishConfig, headers: dict[str, str]) -> None:
    upload_url = f"{API_ROOT}/products/{config.product_id}/submissions/draft/package"
    try:
        data = config.zip_path.read_bytes()
    except OSError as exc:
        raise PublishError(f"Failed to read zip file '{config.zip_path}': {exc}")

    upload_req = request.Request(upload_url, method="POST", data=data)
    upload_req.add_header("Authorization", headers["Authorization"])
    upload_req.add_header("X-ClientID", headers["X-ClientID"])
    upload_req.add_header("Content-Type", "application/zip")
    upload_req.add_header("User-Agent", headers["User-Agent"])

    try:
        with request.urlopen(upload_req) as resp:
            location = resp.headers.get("Location", "")
    except error.HTTPError as exc:
        raise PublishError(_http_error_message("Upload", exc))
    except error.URLError as exc:
        raise PublishError(f"Upload failed (network error): {exc.reason}")

    operation_id = extract_operation_id(location)
    if not operation_id:
        raise PublishError("Upload response did not include a valid operation ID in the Location header.")

    info(f"Upload accepted. Operation ID: {operation_id}")
    upload_status_url = (
        f"{API_ROOT}/products/{config.product_id}/submissions/draft/package/operations/{operation_id}"
    )
    wait_for_operation(upload_status_url, headers, "Upload", config.timeout, config.interval)


def _submit_publish_request(config: PublishConfig, headers: dict[str, str]) -> str:
    publish_url = f"{API_ROOT}/products/{config.product_id}/submissions"
    publish_req = request.Request(publish_url, method="POST", data=(config.notes or " ").encode("utf-8"))
    publish_req.add_header("Authorization", headers["Authorization"])
    publish_req.add_header("X-ClientID", headers["X-ClientID"])
    publish_req.add_header("Content-Type", "text/plain")
    publish_req.add_header("User-Agent", headers["User-Agent"])

    try:
        with request.urlopen(publish_req) as resp:
            location = resp.headers.get("Location", "")
    except error.HTTPError as exc:
        raise PublishError(_http_error_message("Publish request", exc))
    except error.URLError as exc:
        raise PublishError(f"Publish request failed (network error): {exc.reason}")

    operation_id = extract_operation_id(location)
    if not operation_id:
        raise PublishError("Publish response did not include a valid operation ID in the Location header.")
    return operation_id


def publish_submission(config: PublishConfig, headers: dict[str, str]) -> None:
    publish_deadline = time.time() + config.timeout
    while True:
        publish_operation_id = _submit_publish_request(config, headers)
        info(f"Publish accepted. Operation ID: {publish_operation_id}")
        publish_status_url = f"{API_ROOT}/products/{config.product_id}/submissions/operations/{publish_operation_id}"

        remaining = int(publish_deadline - time.time())
        if remaining <= 0:
            message = (
                f"Publish timed out after {config.timeout}s while waiting for available submission slot. "
                "Another submission is still in progress in Edge Add-ons."
            )
            if config.fail_on_in_progress:
                raise PublishError(message)
            warn(message)
            return

        publish_payload = wait_for_operation(
            publish_status_url,
            headers,
            "Publish",
            remaining,
            config.interval,
            allowed_failed_codes={"InProgressSubmission"},
        )
        status = (publish_payload.get("status") or "").lower()
        if status == "succeeded":
            info("Publish completed successfully.")
            return

        error_code = str(publish_payload.get("errorCode") or "")
        if error_code != "InProgressSubmission":
            raise PublishError(f"Publish failed: {_format_operation_payload(publish_payload)}")

        remaining = int(publish_deadline - time.time())
        if remaining <= 0:
            message = (
                f"Publish timed out after {config.timeout}s: {_format_operation_payload(publish_payload)}. "
                "Another submission is still in progress in Edge Add-ons."
            )
            if config.fail_on_in_progress:
                raise PublishError(message)
            warn(message)
            return
        warn("Another submission is in progress. Retrying publish request.")
        time.sleep(min(config.interval, remaining))


def parse_args() -> PublishConfig:
    parser = argparse.ArgumentParser(description="Publish Edge Add-ons update")
    parser.add_argument("--zip", default="dist/edge-acp-autofill.zip", help="Path to extension zip")
    parser.add_argument("--product-id", default=get_env("EDGE_ADDONS_PRODUCT_ID"), help="Edge Add-ons product ID")
    parser.add_argument("--client-id", default=get_env("EDGE_ADDONS_CLIENT_ID"), help="Edge Add-ons client ID")
    parser.add_argument("--api-key", default=get_env("EDGE_ADDONS_API_KEY"), help="Edge Add-ons API key")
    parser.add_argument("--notes", default="", help="Notes for certification")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout seconds per operation")
    parser.add_argument("--interval", type=int, default=10, help="Polling interval seconds (minimum 5)")
    parser.add_argument(
        "--fail-on-in-progress",
        action="store_true",
        help="Exit with an error if another submission is still in progress.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate package and inputs only; do not call Edge Add-ons API.",
    )
    args = parser.parse_args()

    product_id = (args.product_id or "").strip()
    client_id = (args.client_id or "").strip()
    api_key = (args.api_key or "").strip()
    notes = (args.notes.strip() or get_env("EDGE_ADDONS_NOTES")).strip()

    if args.interval < 5:
        raise PublishError("Polling interval must be at least 5 seconds to avoid API over-polling.")

    zip_path = Path(args.zip).resolve()
    if not zip_path.exists():
        raise PublishError(f"Zip not found: {zip_path}")

    if args.timeout <= 0:
        raise PublishError("Timeout must be a positive integer.")

    if not args.dry_run and (not product_id or not client_id or not api_key):
        raise PublishError(
            "Missing required credentials. Set EDGE_ADDONS_PRODUCT_ID, EDGE_ADDONS_CLIENT_ID, EDGE_ADDONS_API_KEY."
        )

    return PublishConfig(
        zip_path=zip_path,
        product_id=product_id,
        client_id=client_id,
        api_key=api_key,
        notes=notes,
        timeout=args.timeout,
        interval=args.interval,
        fail_on_in_progress=bool(args.fail_on_in_progress),
        dry_run=bool(args.dry_run),
    )


def main() -> int:
    try:
        config = parse_args()
        info(f"Starting Edge Add-ons publish for package: {config.zip_path}")
        validate_package_manifest(config.zip_path)
        if config.dry_run:
            info("Dry run completed successfully. No API calls were made.")
            return 0
        headers = _build_auth_headers(config)
        upload_package(config, headers)
        publish_submission(config, headers)
        info("Edge Add-ons publish workflow finished.")
        return 0
    except PublishError as exc:
        fail(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
