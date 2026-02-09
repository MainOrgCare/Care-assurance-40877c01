# Foundry Agent (Render API)

This agent runs in Microsoft Foundry and calls your existing Render API for CareAssurance data.

## Prereqs
- Python 3.10+
- Azure CLI login for local dev (`az login`)
- Foundry project endpoint and a model deployment

## Install
Pin Agent Framework versions while in preview:

```bash
pip install -r requirements.txt
pip install agent-dev-cli --pre
```

## Configure
Copy the example env file and fill in values:

```bash
cp .env.example .env
```

Required values:
- `FOUNDRY_PROJECT_ENDPOINT`
- `FOUNDRY_MODEL_DEPLOYMENT_NAME`
- `RENDER_API_BASE_URL`

Optional:
- `RENDER_API_KEY` (use the same value as `COPILOT_API_KEY` on Render)

## Run locally
```bash
python app/main.py
```

## Debug in VS Code
Use the provided tasks and launch config:
- Task: `Run Agent/Workflow HTTP Server`
- Launch: `Debug Local Agent/Workflow HTTP Server`

## Deploy to Foundry
1. Ensure the Foundry project and model deployment exist.
2. Run the VS Code command: **Microsoft Foundry: Deploy Hosted Agent**.
3. Follow the prompts to select this folder and deployment target.

## Notes
- The agent tool only allows calls to `/api/copilot/*` endpoints and `GET`/`POST` methods.
- If you change your Render base URL, update `RENDER_API_BASE_URL`.
