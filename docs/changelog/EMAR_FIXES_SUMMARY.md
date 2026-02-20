# EMAR Audit Fixes - Summary

## ✅ Fixed: False Positive Detection ("10mg -" Issue)

### Problem
When the EMAR agent was turned OFF, the grid parser was detecting invalid medication names like:
- "10mg -"
- "500mcg /"
- "20mg-"
- Other dose-only patterns with trailing punctuation

### Root Cause
Multiple validation gaps in the medication name detection pipeline:

1. **splitMedicationLabel()** (emarGridParser.ts L144-266)
   - Accepted strength patterns like "10mg" as valid name tokens
   - Didn't reject names ending with trailing punctuation (-, /, \, :, etc.)
   - Allowed dose-only names with incomplete patterns

2. **extractMedicationCandidatesForPage()** (emarGridParser.ts L1668-1676)
   - Insufficient validation after name extraction
   - Didn't check for trailing invalid characters
   - Didn't verify dose-only patterns

3. **emarAgent.extract()** (emarAgent.ts L659-730)
   - No validation of medication names from gridBaseline
   - Propagated parser errors without filtering
   - Missing quality checks on imported medications

### Solution Implemented

#### 1. Enhanced splitMedicationLabel() (emarGridParser.ts)
```typescript
// EARLY CHECK: Pure dose pattern with trailing punctuation
const pureDoselRegex = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\:;,\s]+$/i;
if (pureDoselRegex.test(cleaned)) {
  return { name: "", instructions: cleaned };
}

// ... token processing ...

// REJECT if name ends with invalid trailing characters
if (/[-\/\\:;,]$/.test(name)) {
  return { name: "", instructions: cleaned };
}

// REJECT if name is just a dose with optional trailing punctuation
const isDoseOnlyWithTrailing = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(name);
if (isDoseOnlyWithTrailing) {
  return { name: "", instructions: cleaned };
}

// Enhanced isDoseToken to catch incomplete patterns
if (/^\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\s*[-\/\\]?$/i.test(compact)) return true;
```

#### 2. Strengthened Candidate Filtering (emarGridParser.ts)
```typescript
// STRENGTHENED CHECKS: Reject names with trailing invalid characters or dose-only patterns
const endsWithInvalidChar = candidateNameOnly && /[-\/\\:;,]$/.test(candidateNameOnly);
const isPureDoseFragment = candidateNameOnly && /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(candidateNameOnly);

if (!candidateMeaningful || isLowInformationMedicationName(candidateNameOnly) || endsWithInvalidChar || isPureDoseFragment) {
  continue;
}
```

#### 3. Agent Medication Validation (emarAgent.ts)
```typescript
// VALIDATION: Filter out low-quality medication names
// Reject names ending with invalid trailing characters
if (/[-\/\\:;,]$/.test(name)) {
  return null;
}

// Reject pure dose patterns
if (/^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(name)) {
  return null;
}

// Reject names with no meaningful alphabetic tokens (3+ chars)
const tokens = name.split(/\s+/).filter(Boolean);
const hasMeaningfulToken = tokens.some((token) => {
  const normalized = token.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return normalized.length >= 3 && /[a-zA-Z]/.test(normalized);
});
if (!hasMeaningfulToken) {
  return null;
}
```

### Test Coverage
Added comprehensive test in `server/__tests__/emarAgent.test.ts`:

```typescript
test("emarAgent.extract (gridBaseline) filters out false positive medication names", async () => {
  // Tests filtering of:
  // - "10mg -"
  // - "500mcg /"
  // - "20mg-"
  // - "100ml/"
  
  // Verifies valid medications pass through:
  // - "Paracetamol 500mg" ✓
  // - "Vitamin D3 800IU" ✓
});
```

**Result**: ✅ All tests passing

---

## ⚠️ Still Needs Investigation: Under-Detection (Missing Slots/Rules)

### Problem
When the EMAR agent is turned ON, it's not detecting all medication administration slots and their associated rules.

### Potential Causes

1. **Time Slot Detection Gaps** (emarGridParser.ts L1851-1890)
   ```typescript
   // Current logic only assigns slots within exact Y-coordinate ranges
   if (avgY >= med.yStart && avgY < med.yEnd) {
     med.timeSlots.push({ slot: normalizedSlot, ... });
   }
   ```
   - Staggered layouts may cause slots to appear outside expected Y-ranges
   - No fallback to nearby medications if exact match fails
   - Y-range expansion exists but may miss edge cases

2. **Header Position Dependencies**
   - Time slots detected based on left column labels
   - If labels appear at unusual Y positions, they won't be associated
   - Row-based detection may fail for irregular PDFs

3. **Agent Grid Processing** (emarAgent.ts L720-730)
   - Agent uses pre-parsed `scheduledTimeSlots` from grid
   - If parser misses slots, agent won't generate entries for them
   - No fallback to detect slots from actual cell data

### Recommended Next Steps

#### 1. Get Example EMAR Document
**Need**: A PDF where agent is missing medication slots

**Analysis Plan**:
```bash
# Enable debug logging
export EMAR_GRID_DEBUG=true
export DEBUG_EMAR_GRID=true

# Test with problem document
pnpm tsx script/test-emar-parser.ts path/to/problem-emar.pdf

# Look for in console output:
# - "timeSlotCandidates=X" (how many slots detected?)
# - "dateRows=X" (are dates detected?)
# - "medicationsFound=X" (are meds detected?)
# - Medication-to-slot assignment logs
```

#### 2. Proposed Enhancement: Fallback Slot Detection
Add secondary pass to detect slots from cell evidence:

```typescript
// POST-PROCESS: Infer missing slots from cell content
// If cells exist for (med, date, undetected_slot), add that slot retroactively
const detectSlotFromCells = (medications, cells) => {
  for (const med of medications) {
    const actualSlots = new Set(
      cells
        .filter(cell => cell.medicationRow === med.row)
        .map(cell => normalizeTimeSlot(cell.timeSlot))
        .filter(Boolean)
    );
    
    for (const actualSlot of actualSlots) {
      if (!med.timeSlots.some(ts => ts.slot === actualSlot)) {
        med.timeSlots.push({
          slot: actualSlot,
          y: 0,  // Unknown Y position, but slot exists in data
          yStart: -50,
          yEnd: 9999
        });
        console.log(`Added missing slot "${actualSlot}" from cell evidence`);
      }
    }
  }
};
```

#### 3. Enhanced Y-Range Tolerance
Increase flexibility in slot-to-medication association:

```typescript
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
    nearest.timeSlots.push({
      slot: normalizedSlot,
      y: avgY,
      yStart: avgY - 35,  // Larger range for fallback
      yEnd: avgY + 35
    });
  }
}
```

---

## Files Modified

### Core Changes
1. **server/emarGridParser.ts** (3 changes)
   - Enhanced `splitMedicationLabel()` with early dose pattern checks
   - Added trailing character validation
   - Strengthened candidate filtering in `extractMedicationCandidatesForPage()`

2. **server/services/emarAgent.ts** (1 change)
   - Added medication name validation in gridBaseline processing

### Test Coverage
3. **server/__tests__/emarAgent.test.ts** (1 addition)
   - New test: "filters out false positive medication names"
   - Validates rejection of "10mg -", "500mcg /", "20mg-", "100ml/"
   - Confirms valid medications still pass through

### Documentation
4. **EMAR_AUDIT_ISSUES.md** (created)
   - Detailed analysis of both issues
   - Root cause identification
   - Proposed solutions with code examples
   - Testing approach

5. **EMAR_FIXES_SUMMARY.md** (this file)
   - Summary of fixes applied
   - Test results
   - Outstanding issues and investigation plan

---

## Next Actions

### ✅ Completed
- [x] Fixed false positive detection ("10mg -" issue)
- [x] Added comprehensive validation at 3 levels (parser, candidate filtering, agent)
- [x] Created test coverage for false positives
- [x] All tests passing

### 🔄 Pending Investigation
- [ ] Get example EMAR PDF where agent misses medication slots
- [ ] Enable debug logging and analyze slot detection
- [ ] Implement fallback slot detection from cell evidence
- [ ] Add enhanced Y-range tolerance for staggered layouts
- [ ] Test with real EMAR documents showing the issue

### 📋 Recommended Testing
Once you have a problem EMAR document:
1. Test with agent OFF → Verify no "10mg -" false positives appear
2. Test with agent ON → Verify all time slots are detected
3. Compare both modes → Medications and slot coverage should match
4. Check all medications have complete `scheduledTimeSlots` arrays

---

## Impact Assessment

### Fixed Issue: False Positives
- **Severity**: HIGH (data quality issue)
- **Impact**: Prevents invalid "medications" from appearing in audit reports
- **Risk**: LOW - validation is conservative, unlikely to filter valid medications
- **Testing**: ✅ Comprehensive test coverage added and passing

### Outstanding Issue: Under-Detection
- **Severity**: HIGH (missing critical administration records)
- **Impact**: Incomplete medication administration tracking
- **Risk**: MEDIUM - need real example to assess scope
- **Next Step**: Requires example PDF to debug and fix

---

## Contact for More Info
For questions or to provide test EMAR documents, please share:
1. Example PDF showing missing slots
2. Expected vs actual slot detection results
3. Any error logs or console output from the parsing process
