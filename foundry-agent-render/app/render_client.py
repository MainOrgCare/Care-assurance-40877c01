import json
from typing import Any

import httpx

ALLOWED_PATHS = {
    "/api/copilot/status",
    "/api/copilot/chat",
    "/api/copilot/rewrite-email",
    "/api/copilot/generate-prn-protocol",
    "/api/copilot/analyze-visit-logs",
    "/api/copilot/analyze-risks",
    "/api/copilot/generate-risk-assessment",
    "/api/copilot/generate-care-plan",
    "/api/copilot/enhance-plan",
    "/api/copilot/check-drug-interactions",
    "/api/copilot/dashboard",
    "/api/copilot/care-workers",
    "/api/copilot/audits",
    "/api/copilot/discrepancies",
}

ALLOWED_METHODS = {"GET", "POST"}


def _normalize_path(path: str) -> str:
    if not path.startswith("/"):
        path = "/" + path
    if path not in ALLOWED_PATHS:
        raise ValueError(f"Path not allowed: {path}")
    return path


def _parse_json_body(json_body: str) -> Any | None:
    if not json_body:
        return None
    return json.loads(json_body)


def call_render_api(
    base_url: str,
    api_key: str | None,
    method: str,
    path: str,
    json_body: str,
    timeout_seconds: float,
) -> str:
    method = method.upper()
    if method not in ALLOWED_METHODS:
        raise ValueError(f"Method not allowed: {method}")

    path = _normalize_path(path)
    url = f"{base_url.rstrip('/')}{path}"

    headers = {"Accept": "application/json"}
    if api_key:
        headers["X-Copilot-Key"] = api_key

    payload = _parse_json_body(json_body)
    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.request(method, url, headers=headers, json=payload)

    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return json.dumps(response.json(), indent=2)
    return response.text
