import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv(override=True)

DEFAULT_INSTRUCTIONS = (
    "You are CareAssurance Copilot. Answer clearly and concisely. "
    "Use the Render API tool for data, audits, dashboards, and care planning. "
    "If a request is outside available endpoints, explain what is missing."
)


@dataclass(frozen=True)
class Settings:
    foundry_project_endpoint: str
    foundry_model_deployment_name: str
    render_api_base_url: str
    render_api_key: str | None
    request_timeout_seconds: float
    agent_name: str
    agent_instructions: str


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required env var: {name}")
    return value


def load_settings() -> Settings:
    return Settings(
        foundry_project_endpoint=_require_env("FOUNDRY_PROJECT_ENDPOINT"),
        foundry_model_deployment_name=_require_env("FOUNDRY_MODEL_DEPLOYMENT_NAME"),
        render_api_base_url=_require_env("RENDER_API_BASE_URL"),
        render_api_key=os.getenv("RENDER_API_KEY"),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30")),
        agent_name=os.getenv("AGENT_NAME", "careassurance-agent"),
        agent_instructions=os.getenv("AGENT_INSTRUCTIONS", DEFAULT_INSTRUCTIONS),
    )
