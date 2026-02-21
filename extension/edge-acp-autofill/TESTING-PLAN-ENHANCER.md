# Plan Enhancer Extension Testing

## Testing extractSingleValue Pattern Handler

The Plan Enhancer uses "EXACTLY ONE OF:" prefixes to guide the AI in selecting categorical field values. The browser extension must correctly parse these values before filling form fields.

### Running the Test

1. Open Access ACP Initial Assessment form in Edge/Chrome with the extension installed
2. Open browser DevTools (F12) → Console tab
3. Copy and paste the contents of `test-extract-single-value.js`
4. Press Enter to run the tests

### Expected Output

```
🧪 extractSingleValue Test Suite
  ✅ Test 1: Should extract single value with prefix
  ✅ Test 2: Should handle value without prefix
  ✅ Test 3: Should strip prefix but keep the value
  ...
  📊 Results: 8 passed, 0 failed out of 8 tests

🌍 Real-World Mapping Test
  [table of mapped values]
  📊 Mapping Results: 10 passed, 0 failed out of 10 fields

✨ Test complete! Function available as window.testExtractSingleValue
```

### Manual Testing

After running the automated tests, you can manually test the function:

```javascript
// In console
window.testExtractSingleValue.extractSingleValue("EXACTLY ONE OF: Good");
// Should return: "Good"

window.testExtractSingleValue.extractSingleValue("Independent");
// Should return: "Independent"
```

### Schema Validation

The Plan Enhancer API returns values in this format:

```json
{
  "riskSection1Health": {
    "speech": "Good",
    "hearing": "Fair",
    "memory": "EXACTLY ONE OF: Good"
  },
  "riskSection5Mobility": {
    "walking": "Independent",
    "canBeLeftAlone": "Always"
  }
}
```

Both formats (with and without "EXACTLY ONE OF: " prefix) should work correctly.

### Integration Test

1. Generate a Plan Enhancer output from the UI
2. Click "Send to Extension" button
3. Open the form in the browser extension
4. Verify categorical fields are filled with single clean values (no "EXACTLY ONE OF:" text)
5. Check for yellow highlighting on fields needing verification

### Common Issues

**Issue**: Form fields contain "EXACTLY ONE OF: Good" instead of "Good"
**Solution**: The extractSingleValue function is not being called. Check the mapper in content-initial-assessment.js.

**Issue**: Some fields are filled, others are blank
**Solution**: Check console for mapping errors. The field names in the AI response might not match the mapper expectations.

**Issue**: Values like "Yes / No" appear in dropdowns
**Solution**: The AI returned an ambiguous value. Should be flagged for human verification (yellow highlight).

## Field Schema Reference

### Risk Section 1: Health Assessment

| Field | Type | Options |
|-------|------|---------|
| speech | Select | Good / Fair / Very Poor / Severe Loss |
| hearing | Select | Good / Fair / Very Poor / Severe Loss |
| eyesight | Select | Good / Fair / Very Poor / Severe Loss |
| memory | Select | Good / Forgetful / Very Poor / Severe Loss |
| moods | Select | Stable / Anxious / Depressed / Unstable |
| orientation | Select | Full / Not always / Unaware / Disoriented |
| understandsInfo | Radio | Yes / Partially / No |
| retainsInfo | Radio | Yes / Partially / No |

### Risk Section 5: Mobility

| Field | Type | Options |
|-------|------|---------|
| walking | Select | Independent / Requires Assistance / Uses Equipment / Unable |
| stairs | Select | Independent / Requires Assistance / Uses Equipment / Unable / No steps/stairs |
| canBeLeftAlone | Select | Always / Long Period / Short Period / Not at all |
| proneToFalls | Select | Never / Occasionally / Often / Frequent |

### Risk Section 6: Appliances

| Field | Type | Options |
|-------|------|---------|
| cooker | Radio | Fit for Purpose / Not Fit for Purpose / N/A |
| kettle | Radio | Fit for Purpose / Not Fit for Purpose / N/A |
| iron | Radio | Fit for Purpose / Not Fit for Purpose / N/A |

### Risk Section 7: Fire Safety

| Field | Type | Options |
|-------|------|---------|
| atRisk | Radio | Yes / No |
| ragRating | Select | Red / Amber / Green |
| smokingPolicy | Radio | Yes / No |
| smokeAlarmWorking | Radio | Yes / No |
| coDetectorWorking | Radio | Yes / No |
| actionsTaken | Select | Referral made to Fire Service / Social Services / No Actions Required / Other |

## Troubleshooting

### AI Not Following "EXACTLY ONE OF:" Instructions

Check the system prompt in `server/copilotRoutes.ts`:
- Ensure "EXACTLY ONE OF:" prefix is present in schema
- Verify model is using `temperature: 0` for deterministic output
- Check `response_format: { type: "json_object" }` is set

### Extension Not Mapping Correct Values

1. Check browser console for errors during autofill
2. Verify field IDs match between mapper and actual form
3. Use `DRY_RUN=true` mode to see what would be filled without actually filling
4. Check extractSingleValue is being called on all categorical fields

### Form Validation Failures

Some form dropdowns require exact text matches:
- "Yes" not "yes" or "YES"
- "Good" not "good"
- "Fit for Purpose" not "Fit for purpose"

The extractSingleValue function preserves case, so AI must return exact form values.
