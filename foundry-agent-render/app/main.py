import asyncio
import json
from typing import Annotated

from agent_framework.azure import AzureAIClient
from azure.ai.agentserver.agentframework import from_agent_framework
from azure.identity.aio import DefaultAzureCredential

from app.config import load_settings
from app.render_client import call_render_api


async def main() -> None:
    settings = load_settings()

    def _call(method: str, path: str, body: str = "") -> str:
        return call_render_api(
            base_url=settings.render_api_base_url,
            api_key=settings.render_api_key,
            method=method,
            path=path,
            json_body=body,
            timeout_seconds=settings.request_timeout_seconds,
        )

    # ── Dedicated tools give the LLM clear, typed function signatures ──

    def get_dashboard() -> str:
        """Get care facility dashboard with stats on care workers, audits, discrepancies and service users. Returns summary counts, recent audits and alerts."""
        return _call("GET", "/api/copilot/dashboard")

    def list_care_workers() -> str:
        """List all care workers with their name, role, status and contact details."""
        return _call("GET", "/api/copilot/care-workers")

    def list_audits(
        limit: Annotated[int, "Max number of audits to return (default 20)"] = 20,
    ) -> str:
        """List recent visit audits sorted by date. Shows audit type, service user, status and discrepancy count."""
        return _call("GET", f"/api/copilot/audits?limit={limit}")

    def list_discrepancies(
        status: Annotated[str, "Filter by status: 'unresolved', 'resolved', or empty for all"] = "",
    ) -> str:
        """List discrepancies (compliance issues) found during audits. Can filter by resolution status."""
        path = f"/api/copilot/discrepancies?status={status}" if status else "/api/copilot/discrepancies"
        return _call("GET", path)

    def check_drug_interactions(
        medications: Annotated[str, 'JSON array of medication names, e.g. ["warfarin","ibuprofen","citalopram"]'],
    ) -> str:
        """Check for dangerous drug-drug interactions in a medication list. Returns severity, clinical significance and recommended actions per BNF guidelines. Always include at least 2 medications."""
        meds = json.loads(medications)
        body = json.dumps({"medications": meds})
        return _call("POST", "/api/copilot/check-drug-interactions", body)

    def generate_prn_protocol(
        medication_name: Annotated[str, "Name of the PRN medication, e.g. 'Paracetamol'"],
    ) -> str:
        """Generate a PRN (as-needed) medication protocol for a UK care facility. Returns dose, route, frequency, max daily dose, side effects and special instructions."""
        body = json.dumps({"medicationName": medication_name})
        return _call("POST", "/api/copilot/generate-prn-protocol", body)

    def analyze_visit_logs(
        document_content: Annotated[str, "Full text of visit logs/carer notes to audit"],
    ) -> str:
        """Audit visit logs against compliance rules: location check-in, duration (70% threshold), note quality and concerns. Returns per-visit compliance data, discrepancies and themes."""
        body = json.dumps({"documentContent": document_content})
        return _call("POST", "/api/copilot/analyze-visit", body)

    def analyze_risks(
        document_content: Annotated[str, "Full text of service user documents (referral, medical notes, etc.)"],
    ) -> str:
        """Build a person-centred risk profile from service user documents. Identifies medical conditions, recommended assessments, hazards and overall risk level following CQC 2024 standards."""
        body = json.dumps({"documentContent": document_content})
        return _call("POST", "/api/copilot/analyze-risks", body)

    def generate_risk_assessment(
        category: Annotated[str, "Risk category, e.g. 'Falls', 'Medication', 'Skin Integrity', 'Moving and Handling'"],
        document_content: Annotated[str, "Supporting documents text (optional)"] = "",
        risk_profile: Annotated[str, "JSON risk profile from analyze_risks (optional)"] = "",
    ) -> str:
        """Generate a detailed risk assessment for a specific category following CQC 2024 and NHS guidelines. Includes hazards, likelihood/impact matrix, control measures and action plan."""
        payload: dict = {"category": category}
        if document_content:
            payload["documentContent"] = document_content
        if risk_profile:
            payload["riskProfile"] = json.loads(risk_profile)
        return _call("POST", "/api/copilot/generate-risk-assessment", json.dumps(payload))

    def generate_care_plan(
        document_content: Annotated[str, "Full text of service user documents to create care plan from"],
        call_type: Annotated[str, "Call type: 'Morning', 'Lunch', 'Tea', 'Bed', or 'General'"] = "General",
    ) -> str:
        """Generate a comprehensive care plan with 12 mandatory sections following CQC 2024 standards. Written in first person ('I', 'my'). Covers safety warnings, personal care, mobility, medication, nutrition and more."""
        body = json.dumps({"documentContent": document_content, "callType": call_type})
        return _call("POST", "/api/copilot/generate-care-plan", body)

    def enhance_care_plan(
        existing_plan: Annotated[str, "Text of the current care plan to enhance"] = "",
        document_content: Annotated[str, "New supporting documents to incorporate"] = "",
    ) -> str:
        """Enhance an existing care plan with comprehensive structured data for Initial Assessment form autofill. 
        
        Returns a comprehensive JSON structure with:
        - Personal profile (This Is Me, hobbies, good day definition)
        - Goal setting and assistive technology needs
        - Advance decisions and DNR details
        - Complete care plan (capacity, health conditions, medications, nutrition, personal care, mobility, finances)
        - 10 detailed risk assessment sections (health, medication, nutrition, equipment, mobility, appliances, fire, COSHH, external access, security)
        - Service user support bands (personal care, mental health, physical disability, dementia, etc.)
        - Verification questions for missing information
        
        Each risk section includes categorical fields (using "EXACTLY ONE OF:" constraints), detailed narrative descriptions, risk levels, and prevention measures.
        Designed to populate all fields in the UK care facility Initial Assessment form (Form ID: 1040788)."""
        payload: dict = {}
        if existing_plan:
            payload["existingPlanContent"] = existing_plan
        if document_content:
            payload["documentContent"] = document_content
        return _call("POST", "/api/copilot/enhance-plan", json.dumps(payload))

    def rewrite_email(
        input_text: Annotated[str, "Rough notes or draft text to turn into a polished email"],
        tone: Annotated[str, "Tone: 'professional', 'direct', 'empathetic', 'formal', or 'urgent'"] = "professional",
    ) -> str:
        """Transform rough notes into a polished, well-structured email for UK care facility correspondence. Adds greeting, sign-off and proper formatting."""
        body = json.dumps({"inputText": input_text, "tone": tone, "generateSubject": True})
        return _call("POST", "/api/copilot/rewrite-email", body)

    def general_chat(
        message: Annotated[str, "Question about care compliance, CQC standards, EMAR, policies or general care topics"],
    ) -> str:
        """Ask the CareAssurance AI assistant (Compli-ee) about care compliance, CQC standards, EMAR, medication management, risk assessment or policy interpretation."""
        body = json.dumps({"message": message})
        return _call("POST", "/api/copilot/chat", body)

    all_tools = [
        get_dashboard,
        list_care_workers,
        list_audits,
        list_discrepancies,
        check_drug_interactions,
        generate_prn_protocol,
        analyze_visit_logs,
        analyze_risks,
        generate_risk_assessment,
        generate_care_plan,
        enhance_care_plan,
        rewrite_email,
        general_chat,
    ]

    async with DefaultAzureCredential() as credential:
        async with AzureAIClient(
            project_endpoint=settings.foundry_project_endpoint,
            model_deployment_name=settings.foundry_model_deployment_name,
            credential=credential,
        ).create_agent(
            name=settings.agent_name,
            instructions=settings.agent_instructions,
            tools=all_tools,
        ) as agent:
            await from_agent_framework(agent).run_async()


if __name__ == "__main__":
    asyncio.run(main())
