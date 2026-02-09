import asyncio
from typing import Annotated

from agent_framework.azure import AzureAIClient
from azure.ai.agentserver.agentframework import from_agent_framework
from azure.identity.aio import DefaultAzureCredential

from app.config import load_settings
from app.render_client import call_render_api


def _tool_description() -> str:
    return (
        "Call the CareAssurance Render API. Provide a valid path and JSON body. "
        "Allowed paths are under /api/copilot/* as defined by the service."
    )


async def main() -> None:
    settings = load_settings()

    def render_request(
        path: Annotated[str, "API path, e.g. /api/copilot/dashboard"],
        method: Annotated[str, "HTTP method: GET or POST"] = "GET",
        json_body: Annotated[str, "JSON string payload for POST"] = "",
    ) -> str:
        return call_render_api(
            base_url=settings.render_api_base_url,
            api_key=settings.render_api_key,
            method=method,
            path=path,
            json_body=json_body,
            timeout_seconds=settings.request_timeout_seconds,
        )

    render_request.__doc__ = _tool_description()

    async with DefaultAzureCredential() as credential:
        async with AzureAIClient(
            project_endpoint=settings.foundry_project_endpoint,
            model_deployment_name=settings.foundry_model_deployment_name,
            credential=credential,
        ).create_agent(
            name=settings.agent_name,
            instructions=settings.agent_instructions,
            tools=[render_request],
        ) as agent:
            await from_agent_framework(agent).run_async()


if __name__ == "__main__":
    asyncio.run(main())
