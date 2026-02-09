import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

ALLOWED_PATHS = {
    "/api/copilot/status",
    "/api/copilot/chat",
    "/api/copilot/rewrite-email",
    "/api/copilot/generate-prn-protocol",
    "/api/copilot/analyze-visit",
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

# Retry configuration
MAX_RETRIES = 3
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


def _normalize_path(path: str) -> str:
    if not path.startswith("/"):
        path = "/" + path
    if path not in ALLOWED_PATHS:
        raise ValueError(
            f"Path not allowed: {path}. "
            f"Allowed paths: {', '.join(sorted(ALLOWED_PATHS))}"
        )
    return path


def _parse_json_body(json_body: str) -> Any | None:
    if not json_body:
        return None
    try:
        return json.loads(json_body)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON body: {e}")


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
        raise ValueError(f"Method not allowed: {method}. Use GET or POST.")

    path = _normalize_path(path)
    url = f"{base_url.rstrip('/')}{path}"

    headers = {"Accept": "application/json"}
    if api_key:
        headers["X-Copilot-Key"] = api_key

    payload = _parse_json_body(json_body)

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.request(method, url, headers=headers, json=payload)

            if response.status_code in RETRY_STATUS_CODES and attempt < MAX_RETRIES - 1:
                import time
                wait = 2 ** attempt
                logger.warning(
                    "Render API returned %d for %s, retrying in %ds (attempt %d/%d)",
                    response.status_code, path, wait, attempt + 1, MAX_RETRIES,
                )
                time.sleep(wait)
                continue

            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                return json.dumps(response.json(), indent=2)
            return response.text

        except httpx.TimeoutException:
            last_error = f"Request to {path} timed out after {timeout_seconds}s"
            if attempt < MAX_RETRIES - 1:
                import time
                time.sleep(2 ** attempt)
                continue
        except httpx.ConnectError:
            last_error = f"Could not connect to {base_url}. The Render service may be sleeping — retry in ~30s."
            if attempt < MAX_RETRIES - 1:
                import time
                time.sleep(2 ** attempt)
                continue
        except httpx.HTTPStatusError as e:
            raise ValueError(
                f"API error {e.response.status_code} for {path}: "
                f"{e.response.text[:500]}"
            )

    raise ValueError(last_error or f"Failed after {MAX_RETRIES} attempts")
