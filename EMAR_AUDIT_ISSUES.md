# EMAR Audit Deep Dive - Issues & Solutions

## Problems Identified

### Issue 1: EMAR Agent Not Detecting All Medication Slots
**When**: Agent is turned ON (using grid baseline)  
**Symptom**: Missing medication administration slots and their associated rules

**Root Causes**:
1. **Time Slot Detection Gaps** ([emarGridParser.ts](server/emarGridParser.ts#L1851-L1870))
   - Time slots are only detected if they appear as explicit labels in the left column
   - Staggered layouts where slots appear at varying Y positions may cause splits
   - Y-range expansion logic exists but may miss edge cases

2. **Medication-Slot Association** ([emarGridParser.ts](server/emarGridParser.ts#L1869-L1889))
   - Each medication block has time slots assigned based on Y-coordinate matching
   - If a time slot label appears outside the expected Y-range, it won't be associated
   - Row-based detection may fail for irregular PDFs

3. **Agent Grid Baseline Processing** ([emarAgent.ts](server/services/emarAgent.ts#L647-L720))
   - Agent builds entries from grid cells only
   - If parser misses time slots, agent won't generate entries for those slots
   - No fallback to detect slots from actual administration entries

**Evidence**:
```typescript
// Line 1869-1889: Time slot association logic
for (const slotLabel of timeSlotMatches) {
  const normalizedSlot = normalizeSlot(slotLabel);
  const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;

  for (const med of medsOnPage) {
    if (avgY >= med.yStart && avgY < med.yEnd) {
      // Only adds if Y matches - may miss slots
      med.timeSlots.push({
        slot: normalizedSlot,
        y: avgY,
        yStart: avgY - 25,
        yEnd: avgY + 25
      });
      break;
    }
  }
}
```

### Issue 2: False Positive Detection - "10mg -" as Medication
**When**: Agent is turned OFF (pure parser mode)  
**Symptom**: Non-medications like "10mg -" detected as medications

**Root Causes**:
1. **Overly Broad Pattern Matching** ([emarGridParser.ts](server/emarGridParser.ts#L934-L937))
   ```typescript
   const medicationPattern = /\d+\s*(mg|mcg|ml|%|g|units?|iu)/i;
   const medicationPatternLoose = /\b(\d+\s*(mg|mcg|ml|%|g|units?|iu)|...)\b/i;
   ```
   - These patterns match ANY text containing dose units
   - "10mg -" matches because it contains "10mg"
   - No context checking to ensure it's actually a medication name

2. **Weak Name Validation** ([emarGridParser.ts](server/emarGridParser.ts#L238-243))
   ```typescript
   const nameLooksDoseOnly = nameTokensNormalized.every(isDoseToken);
   if (nameLooksDoseOnly) {
     return { name: "", instructions: cleaned };
   }
   ```
   - Should catch "10mg" but hyphen at end may bypass this
   - `isDoseToken` doesn't handle incomplete patterns like "10mg -"

3. **Insufficient Filtering** ([emarGridParser.ts](server/emarGridParser.ts#L942-962))
   ```typescript
   const isLowInformationMedicationName = (name: string): boolean => {
     // Checks for alphabetic characters
     const hasAlpha = tokens.some((t) => /[a-zA-Z]/.test(t));
     if (!hasAlpha) return true; // ✅ Would catch "10mg -"
     // ... more checks
   }
   ```
   - This SHOULD catch "10mg -" but may not be called in all code paths

4. **splitMedicationLabel Issues** ([emarGridParser.ts](server/emarGridParser.ts#L137-246))
   - Complex token-by-token parsing
   - May extract dose strength as "name" if followed by hyphens or dashes
   - Example flow for "10mg - Take one tablet":
     * Token 1: "10mg" → strength pattern matches → added to name
     * Token 2: "-" → not a stop word → continues
     * Token 3: "-" may be interpreted as range pattern or instruction start
     * Result: name = "10mg -", instructions = "Take one tablet"

**Evidence in Code Path**:
```typescript
// Line 147-220: splitMedicationLabel token processing
for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i];
  const lower = token.toLowerCase();
  
  // Checks for strength patterns
  if (startsWithDigit) {
    const compact = token.replace(/[()]/g, "").trim();
    if (strengthPattern.test(compact) || strengthRatioPattern.test(compact)) {
      nameTokens.push(token); // ✅ "10mg" gets added
      continue;
    }
    // Range pattern check
    if (rangePattern.test(token)) {
      stopIndex = i; // ❌ "-" alone may not match rangePattern
      break;
    }
    // If not in name tokens yet, may stop
    if (nameTokens.length === 0) {
      continue; // ✅ Should skip
    }
    stopIndex = i;
    break;
  }
  nameTokens.push(token); // ❌ "-" might get added here
}
```

## Solutions

### Fix 1: Improve Time Slot Detection & Association

**Location**: [emarGridParser.ts](server/emarGridParser.ts#L1851-L1890)

**Changes Needed**:
1. **Expand Y-Range Tolerance** for slot detection
2. **Add Multi-Pass Slot Detection**: First pass per medication block, second pass for missed rows
3. **Fallback Slot Inference**: Detect slots from actual cell data if label scan misses them

```typescript
// Enhanced time slot detection with fallback
for (let i = ph.headerRowIndex + 1; i < rows.length; i++) {
  const row = rows[i];
  const leftItems = row.filter(item => item.x < leftCutoff);
  const leftText = leftItems.map(item => item.str).join(" ");
  const timeSlotMatches = extractSlotLabels(leftText);

  for (const slotLabel of timeSlotMatches) {
    const normalizedSlot = normalizeSlot(slotLabel);
    const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;

    // PRIMARY: Try exact Y-match first
    let matched = false;
    for (const med of medsOnPage) {
      if (avgY >= med.yStart && avgY < med.yEnd) {
        const existingSlot = med.timeSlots.find(ts => ts.slot === normalizedSlot);
        if (!existingSlot) {
          med.timeSlots.push({
            slot: normalizedSlot,
            y: avgY,
            yStart: avgY - 25,
            yEnd: avgY + 25
          });
        } else {
          // Expand range for staggered layouts
          existingSlot.yStart = Math.min(existingSlot.yStart, avgY - 25);
          existingSlot.yEnd = Math.max(existingSlot.yEnd, avgY + 25);
          existingSlot.y = (existingSlot.yStart + existingSlot.yEnd) / 2;
        }
        matched = true;
        break;
      }
    }

    // FALLBACK: Assign to nearest medication if no exact match (within 50px)
    if (!matched && medsOnPage.length > 0) {
      let nearest: MedicationBlock | null = null;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const med of medsOnPage) {
        const medCenterY = (med.yStart + med.yEnd) / 2;
        const dist = Math.abs(avgY - medCenterY);
        if (dist < nearestDist && dist < 50) {
          nearestDist = dist;
          nearest = med;
        }
      }
      if (nearest) {
        const existingSlot = nearest.timeSlots.find(ts => ts.slot === normalizedSlot);
        if (!existingSlot) {
          nearest.timeSlots.push({
            slot: normalizedSlot,
            y: avgY,
            yStart: avgY - 35,  // Larger range for fallback
            yEnd: avgY + 35
          });
        }
      }
    }

    // Track globally
    if (!allTimeSlots.includes(normalizedSlot)) {
      allTimeSlots.push(normalizedSlot);
    }
  }
}

// POST-PROCESS: Infer missing slots from cell content
// If cells exist for (med, date, undetected_slot), add that slot retroactively
```

### Fix 2: Strengthen Medication Name Validation

**Location**: [emarGridParser.ts](server/emarGridParser.ts#L137-246)

**Changes Needed**:
1. **Early exit for dose-only patterns** before name extraction
2. **Stricter trailing character checks** (reject names ending with "-", "/", etc.)
3. **Minimum meaningful token requirement**

```typescript
const splitMedicationLabel = (label: string): { name: string; instructions: string } => {
  const cleaned = String(label || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { name: "", instructions: "" };

  // EARLY CHECK: Pure dose pattern (e.g., "10mg", "10mg -", "500mcg /")
  const pureDoselRegex = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\s]*$/i;
  if (pureDoselRegex.test(cleaned)) {
    return { name: "", instructions: cleaned };
  }

  const tokens = cleaned.split(" ").filter(Boolean);
  const firstToken = tokens[0]?.toLowerCase() || "";
  if (MEDICATION_NAME_STOP_WORDS.has(firstToken) || MEDICATION_NAME_INSTRUCTION_WORDS.has(firstToken)) {
    return { name: "", instructions: cleaned };
  }

  // ... existing token processing ...

  const name = nameTokens.join(" ").trim();
  
  // REJECT if name ends with invalid characters
  if (name && /[-\/\\:;,\s]$/.test(name)) {
    return { name: "", instructions: cleaned };
  }

  // REJECT if name is only doses/numbers with trailing punctuation
  const isDoseOnlyWithTrailing = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/]$/i.test(name);
  if (isDoseOnlyWithTrailing) {
    return { name: "", instructions: cleaned };
  }

  const instructions = stopIndex < tokens.length ? tokens.slice(stopIndex).join(" ").trim() : "";

  const isDoseToken = (token: string): boolean => {
    const compact = token.replace(/[()]/g, "").trim();
    if (!compact) return false;
    if (strengthPattern.test(compact) || strengthRatioPattern.test(compact)) return true;
    if (quantityPattern.test(compact) || rangePattern.test(compact)) return true;
    if (/^\d+(?:\.\d+)?$/.test(compact)) return true;
    if (/^\d/.test(compact) && /(?:mg|mcg|g|ml|iu|units?|%)$/i.test(compact)) return true;
    // NEW: Reject incomplete patterns
    if (/^\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\s*[-\/]?$/i.test(compact)) return true;
    return false;
  };

  if (!name) return { name: "", instructions: cleaned };
  const nameTokensNormalized = name.split(/\s+/).filter(Boolean);
  const nameLooksDoseOnly = nameTokensNormalized.length > 0 && nameTokensNormalized.every(isDoseToken);
  if (nameLooksDoseOnly) {
    return { name: "", instructions: cleaned };
  }
  
  return { name, instructions: instructions || cleaned };
};
```

### Fix 3: Enhanced Candidate Filtering

**Location**: [emarGridParser.ts](server/emarGridParser.ts#L1598-1675)

**Changes Needed**: Add validation before accepting medication candidates

```typescript
// In extractMedicationCandidatesForPage, before adding to candidates:
const split = splitMedicationLabel(trimmedCandidate);
const candidateNameOnly = split.name.trim();

// STRENGTHENED CHECKS
const candidateMeaningful = Boolean(candidateNameOnly) && hasMeaningfulMedicationToken(candidateNameOnly);
const endsWithInvalidChar = /[-\/\\:;,\s]$/.test(candidateNameOnly);
const isPureDoseFragment = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/]?$/i.test(candidateNameOnly);

if (!candidateMeaningful || isLowInformationMedicationName(candidateNameOnly) || endsWithInvalidChar || isPureDoseFragment) {
  continue;
}

// ... rest of validation ...
```

### Fix 4: Agent Slot Completeness Check

**Location**: [emarAgent.ts](server/services/emarAgent.ts#L647-720)

**Changes Needed**: Validate that all detected time slots are represented for each medication

```typescript
// After building medications with IDs from grid baseline:
const medicationsWithIds = mergedMetadata.medications.map((med, index) => ({
  ...med,
  medicationId: index + 1,
  scheduledTimeSlots: med.scheduledTimeSlots.length > 0 ? med.scheduledTimeSlots : mergedMetadata.timeSlots,
  requiredGapHours: clampNumber(Math.round(Number(med.requiredGapHours || 0) || 4), 1, 24),
}));

// VALIDATION: Check for slot completeness
for (const med of medicationsWithIds) {
  // Get actual slots found in cells for this medication
  const actualSlots = new Set(
    rawCells
      .filter((cell: any) => {
        const cellMedId = resolveCellMedicationId(cell);
        return cellMedId === med.medicationId;
      })
      .map((cell: any) => normalizeTimeSlot(cell?.timeSlot))
      .filter(Boolean)
  );
  
  // If cells show more slots than medication definition, expand it
  for (const actualSlot of actualSlots) {
    if (!med.scheduledTimeSlots.includes(actualSlot)) {
      med.scheduledTimeSlots.push(actualSlot);
      console.log(`[EMAR Agent] Added missing slot "${actualSlot}" to medication ${med.name} from cell evidence`);
    }
  }
}
```

## Testing Approach

### Test Case 1: Time Slot Detection
**Input**: EMAR PDF with staggered time slot labels  
**Expected**: All time slots detected and properly associated with medications  
**Validation**: Check `result.medications[].timeSlots` completeness

### Test Case 2: False Positive Filtering
**Input**: EMAR with fragments like "10mg -", "500mcg /", "20mg - Take"  
**Expected**: These NOT detected as medications  
**Validation**: Check `result.medications[].name` for invalid patterns

### Test Case 3: Agent vs Parser Mode
**Input**: Same EMAR PDF  
**Expected**: Similar medication count and slot coverage in both modes  
**Validation**: Compare agent ON vs agent OFF results

## Debug Commands

```bash
# Enable detailed EMAR grid parsing debug output
export EMAR_GRID_DEBUG=true
export DEBUG_EMAR_GRID=true

# Test parser directly
pnpm tsx script/test-emar-parser.ts path/to/emar.pdf

# Test with agent
# (requires server endpoint call with agentEnabled: true/false)
```

## Implementation Priority

1. **HIGH**: Fix 2 (False Positive Prevention) - Critical data quality issue
2. **HIGH**: Fix 1 (Time Slot Detection) - Missing critical administration records
3. **MEDIUM**: Fix 4 (Agent Validation) - Improves agent reliability
4. **MEDIUM**: Fix 3 (Enhanced Filtering) - Additional safety net

## Related Files

- [emarGridParser.ts](server/emarGridParser.ts) - Core PDF parsing logic
- [emarAgent.ts](server/services/emarAgent.ts) - AI agent for EMAR extraction
- [emarAgent.test.ts](server/__tests__/emarAgent.test.ts) - Test cases
- [EMARAudit.tsx](client/src/pages/care-workers/EMARAudit.tsx) - UI displaying results
