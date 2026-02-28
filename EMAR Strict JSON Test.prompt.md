Use this with the preset "EMAR Strict JSON Test".

TASK
Extract medication administration events from the provided eMAR content.

RULES
- Return valid JSON only.
- Must match the provided structured output schema exactly.
- No markdown, no prose, no extra keys.
- Allowed non-administration codes: R, SA, F, NH, MU.
- NH always requires verification.
- Include all detected care worker names in allCareWorkers.
- If care worker is unknown, infer from records in the same date + timeSlot when possible and set inferredFromSameSlot=true.
- If unknown after inference, set careWorker=null and inferredFromSameSlot=false.
- Use YYYY-MM-DD dates when possible; otherwise null.
- Add trendWarnings when repeated R/SA/F/NH/MU patterns appear.

INPUT
{{PASTE_EMAR_TEXT_OR_TABLE_HERE}}
