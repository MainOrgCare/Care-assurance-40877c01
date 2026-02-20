# Testing Risk Assessment Improvements

## ✅ Changes Successfully Implemented

The risk assessment tool has been completely rewritten to follow **CQC 2024** and **NHS England 2024** standards.

---

## 🧪 How to Test

### **1. Server Restart Required**

```bash
# Stop the current server (Ctrl+C in the terminal)
# Then restart:
npx tsx server/index.ts
```

OR if you're using the build:

```bash
npm run build
npm start
```

### **2. Clear Cache (Important!)**

The system caches risk analysis results. To test the new improvements:

**Option A**: Upload NEW documents that haven't been analyzed before  
**Option B**: Modify existing documents slightly (add a space, change a word) to invalidate cache  
**Option C**: Wait for cache to expire naturally  

---

## 🎯 Test Scenarios

### **Test 1: Specific Condition Only**

**Upload**: Care plan that mentions:

```
"John has Type 2 diabetes and needs support monitoring 
his blood sugar twice daily. He takes metformin."
```

**Expected Result**:
✅ Diabetes Management (ONLY)

- isMandatory: false
- First-person reason: "I have Type 2 diabetes and need support monitoring my blood sugar..."
- Evidence snippets included

❌ Should NOT recommend:

- Falls Prevention (not mentioned)
- Medication Administration (metformin is self-administered based on wording)
- Fire Safety (no fire hazards mentioned)
- Any other assessments

---

### **Test 2: Multiple Documented Needs**

**Upload**: Documents mentioning:

```
- History of 3 falls in past 6 months
- Uses walking frame for mobility
- Needs help with washing and dressing
- Has diabetes
```

**Expected Result**:
✅ Falls Prevention
✅ Mobility & Moving and Handling
✅ Personal Care
✅ Diabetes Management

All with:

- isMandatory: false
- First-person explanations
- 2-6 evidence snippets each

---

### **Test 3: Template Detection (Critical Test)**

**Upload BOTH**:

1. **Risk assessment template** containing placeholder text:

   ```
   "Service user may have risk of falls"
   "Diabetes management may be required"
   "Assess for pressure area risk"
   ```

2. **Actual care plan** containing:

   ```
   "Mary has epilepsy and had a seizure last week.
   She has rescue medication that carers need to know about."
   ```

**Expected Result**:
✅ Epilepsy Management (ONLY - from actual care plan)

❌ Should NOT recommend:

- Falls Prevention (only in template)
- Diabetes Management (only in template)
- Skin Integrity (only in template)

**This is the CRITICAL TEST** - verifies the system ignores template content.

---

### **Test 4: Minimal Needs Service User**

**Upload**: Simple care plan:

```
"Robert is fully independent but needs help with 
shopping once a week due to lack of transport."
```

**Expected Result**:

- Possibly NO risk assessments recommended
- Or only Environmental Safety IF shopping involves specific documented hazards
- isMandatory: false for any recommendation

❌ Should NOT recommend:

- Generic "everyone needs this" assessments
- Mobility (he's fully independent)
- Personal Care (he's independent)
- Falls Prevention (nothing mentioned)

---

### **Test 5: First-Person Format Check**

**Upload**: Any care plan with documented needs.

**Check EVERY recommendation**:
✅ Reason field should start with "I" or "My"
✅ Should read naturally in first person
✅ Example: "I have epilepsy and had a seizure last week..."

❌ Should NOT say:

- "The service user has..."
- "They require..."
- "Assessment needed for..."

---

## 🔍 What to Look For

### **Quality Indicators** ✅

1. **Relevance**: Only assessments with documented evidence
2. **First-Person**: All reasons use "I" and "my"
3. **Evidence**: Each assessment has 2-6 specific quotes
4. **No Mandatory**: All "isMandatory" fields are `false`
5. **Conservative**: Fewer assessments than before (quality over quantity)

### **Red Flags** ❌

1. Assessments appearing without documented evidence
2. Generic recommendations "just in case"
3. Third-person language ("the service user")
4. Automatic mandatory flags
5. Template content being used as evidence
6. Long list of "all possible" assessments

---

## 📊 Before vs After Comparison

### **Expected Reduction in Recommendations**

The new system should recommend **30-50% fewer assessments** on average because it:

- Requires stronger evidence
- Filters out generic recommendations
- Ignores template/placeholder text
- Takes person-centred approach

**This is GOOD** - it means the system is working correctly!

---

## 🐛 If You See Issues

### **Problem**: Still showing all assessments

**Solution**:

1. Make sure server was restarted after changes
2. Clear cache by uploading different documents
3. Check that uploaded files contain REAL service user info (not just templates)

### **Problem**: Not showing any assessments when there should be some

**Solution**:

1. Check that evidence is SPECIFIC (not just one vague mention)
2. Ensure documents clearly describe care needs
3. Verify documents mention conditions/needs multiple times

### **Problem**: Evidence snippets don't match recommendations

**Solution**:

1. This suggests template content is being used
2. Make sure "Documents to analyze:" section has real content
3. Check policy documents are properly labeled as templates

---

## 📸 Screenshots to Compare

### **Old System** (Before)

- 15+ assessments recommended
- Many marked "Mandatory"
- Generic reasons
- Evidence from templates

### **New System** (After)

- 3-5 highly relevant assessments
- None marked "Mandatory"
- First-person reasons
- Evidence from real documents

---

## ✅ Success Criteria

The improvements are working correctly if you see:

1. ✅ **Fewer recommendations** (more focused, person-centred)
2. ✅ **First-person language** throughout
3. ✅ **Specific evidence** (2-6 quotes per assessment)
4. ✅ **No automatic mandatory flags**
5. ✅ **Template content ignored** (only real docs analyzed)
6. ✅ **Conservative approach** (better to omit than over-recommend)

---

## 🚀 Next Steps After Testing

1. **Test with Real Service Users**: Use actual care documents from your system
2. **Staff Training**: Explain the new person-centred approach
3. **Document Templates**: Ensure templates are clearly labeled as reference only
4. **Feedback Loop**: Report any assessments that seem over/under-recommended

---

## 📞 Reporting Issues

If you find issues during testing, provide:

1. **What You Uploaded**: Brief description of document content
2. **What You Expected**: Which assessments should appear
3. **What You Got**: Which assessments actually appeared
4. **Evidence Snippets**: What evidence was cited (to verify it's not from templates)

---

## 📚 Full Documentation

- See [RISK_ASSESSMENT_IMPROVEMENTS.md](./RISK_ASSESSMENT_IMPROVEMENTS.md) for complete details
- See [RISK_ASSESSMENT_QUICK_REFERENCE.md](./RISK_ASSESSMENT_QUICK_REFERENCE.md) for quick overview

---

*Ready to test? Restart the server and try Test Scenario 3 (Template Detection) first!*
