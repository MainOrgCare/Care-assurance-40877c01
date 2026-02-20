# Care Plan Call Types Enhancement

## ✅ Completed Backend Changes

### 1. Risk Assessment - No More 3-5 Limit
**File**: `/server/routes.ts`  
**Lines**: 10410-10420, 10560-10570

✅ Changed from "CONSERVATIVE APPROACH" to "COMPREHENSIVE APPROACH"  
✅ Now recommends ALL assessments with strong evidence (minimum 3-5, but can be 20+ if needed)  
✅ Quality evidence required for each, but no artificial quantity restriction  

### 2. New Endpoint: Get Service User Call Types
**File**: `/server/routes.ts`  
**Line**: ~11057

✅ Added `POST /api/service-user/call-types`  
✅ Accepts `{ serviceUserName }` in body  
✅ Returns:
```json
{
  "callTypes": ["Morning", "Tea", "Bed", "Domestic"],
  "serviceUserKey": "SU-12345",
  "serviceUserName": "John Smith",
  "orders": [
    {
      "callType": "Morning",
      "timeBand": "06:00-10:00",
      "daysPerWeek": 7,
      "duration": 45,
      "carersRequired": 2
    }
  ]
}
```

### 3. Care Plan Generation - Call Type Specific
**File**: `/server/routes.ts`  
**Lines**: 11119-11350

✅ Updated `POST /api/ai/generate-care-plan` to accept `callType` parameter  
✅ Added CQC 2024 principles to system prompt  
✅ Added call-type-specific context:
   - Morning: Wake up, breakfast, morning meds, washing, dressing
   - Lunch: Meal prep/eating, fluids, repositioning
   -Tea: Tea/snack, evening meds, personal care
   - Bed: Night meds, personal care, night routine
   - Domestic: Cleaning, laundry, shopping, meal prep

✅ Changed output format to **single content block** instead of sections:
```json
{
  "content": "200+ word first-person narrative covering all aspects of care for this call type"
}
```

✅ First-person enforcement: "I need...", "My carers help me..."  
✅ No m-dashes, en-dashes, or Oxford commas  
✅ CQC 2024 person-centred principles integrated  

---

## ✅ Completed Frontend Changes

### 1. Type Definitions Updated
**File**: `/client/src/pages/service-users/CarePlanning.tsx`  
**Lines**: 18-43

✅ Added `CallTypeInfo` interface  
✅ Updated `CarePlanResult` to support both:
   - New format: `content?: string` (single block per call type)
   - Legacy format: `sections?: CarePlanSection[]` (multi-section)

### 2. State Management Added
**File**: `/client/src/pages/service-users/CarePlanning.tsx`  
**Lines**: 47-70

✅ Added call type state:
   - `availableCallTypes: string[]` - List of call types from database
   - `callTypeDetails: CallTypeInfo[]` - Full call type information
   - `selectedCallType: string | null` - Currently selected call type
   - `loadingCallTypes: boolean` - Loading state for fetch

✅ Added care plans by call type:
   - `carePlansByTypeRaw: Map<string, CarePlanResult>` - One plan per call type (full names)
   - `carePlansByTypeScrubbed: Map<string, CarePlanResult>` - One plan per call type (initials only)

✅ Backward compatibility maintained with legacy single plan state

### 3. Format Detection Logic
**File**: `/client/src/pages/service-users/CarePlanning.tsx`  
**Lines**: 75-85

✅ Added `isSimplifiedFormat` flag  
✅ Detects new format (content field) vs legacy format (sections array)  
✅ Sections logic updated to handle both formats  

---

## 🚧 What Remains (UI Implementation)

The backend is **100% complete** and ready to use. What remains is the frontend UI to:

### 1. Fetch Call Types Button
Add before the "Generate Care Plan" button:

```tsx
{!availableCallTypes.length && (
  <Button 
    onClick={fetchCallTypes}
    disabled={loadingCallTypes}
    className="w-full gap-2.5"
  >
    {loadingCallTypes ? <Loader2 className="animate-spin" /> : <Search />}
    Find Call Types for This Service User
  </Button>
)}
```

### 2. Call Type Pills/Toggles
Display available call types once fetched:

```tsx
{availableCallTypes.length > 0 && (
  <div className="space-y-3">
    <span className="text-xs font-bold uppercase">Select Call Type:</span>
    <ToggleGroup 
      type="single"
      value={selectedCallType || ""}
      onValueChange={setSelectedCallType}
    >
      {availableCallTypes.map(callType => (
        <ToggleGroupItem key={callType} value={callType}>
          {callType}
          {carePlansByTypeRaw.has(callType) && <CheckCircle2 size={14} />}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  </div>
)}
```

### 3. Update Generate Button
Only enable if a call type is selected:

```tsx
<Button 
  onClick={() => generateMutation.mutate()}
  disabled={!selectedCallType || generateMutation.isPending}
>
  Generate {selectedCallType} Care Plan
</Button>
```

### 4. Update Generation Mutation
Pass `callType` to API:

```tsx
const generateMutation = useMutation({
  mutationFn: async () => {
    // ... existing code ...
    
    const response = await fetch("/api/ai/generate-care-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ 
        documentContent, 
        callType: selectedCallType, // ADD THIS
        allowSensitive: isAdmin && allowSensitive 
      }),
    });
    
    // ... handle SSE stream, but simplified format (content field) not sections ...
    // Store result in carePlansByTypeRaw/Scrubbed.set(selectedCallType, result)
  }
});
```

### 5. Display Simplified Format
Update rendering to handle single content block:

```tsx
{carePlan && isSimplifiedFormat && (
  <Card>
    <CardHeader>
      <CardTitle>{carePlan.callType} Care Plan</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="prose prose-sm max-w-none">
        <p className="whitespace-pre-wrap">{carePlan.content}</p>
      </div>
      <Button onClick={() => copyToClipboard(carePlan.content)}>
        Copy Care Plan
      </Button>
    </CardContent>
  </Card>
)}
```

### 6. Add Call Type Tabs
Allow switching between generated care plans:

```tsx
{carePlansByTypeRaw.size > 1 && (
  <Tabs value={selectedCallType} onValueChange={setSelectedCallType}>
    <TabsList>
      {Array.from(carePlansByTypeRaw.keys()).map(callType => (
        <TabsTrigger key={callType} value={callType}>
          {callType}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
)}
```

---

## 📋 Implementation Function: fetchCallTypes

Add this function after the mutations:

```typescript
const fetchCallTypes = async () => {
  setLoadingCallTypes(true);
  try {
    // Extract service user name from documents or use initials
    const serviceUserName = serviceUserData.socialWork?.content?.match(/Name:?\s*([A-Z][a-z]+ [A-Z][a-z]+)/)?.[1] 
                         || serviceUserData.initialAssessment?.content?.match(/Name:?\s*([A-Z][a-z]+ [A-Z][a-z]+)/)?.[1]
                         || "Unknown";
    
    const response = await fetch("/api/service-user/call-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ serviceUserName }),
    });
    
    if (!response.ok) throw new Error("Failed to fetch call types");
    
    const data = await response.json();
    setAvailableCallTypes(data.callTypes || []);
    setCallTypeDetails(data.orders || []);
    
    if (data.callTypes.length > 0) {
      setSelectedCallType(data.callTypes[0]); // Auto-select first
      toast({
        title: "Call Types Found",
        description: `Found ${data.callTypes.length} call type(s) for ${data.serviceUserName}`,
      });
    } else {
      toast({
        title: "No Call Types",
        description: "No scheduled calls found. Generate a general care plan instead.",
        variant: "warning",
      });
    }
  } catch (error) {
    toast({
      title: "Error",
      description: "Failed to fetch call types. Ensure service user name matches database.",
      variant: "destructive",
    });
  } finally {
    setLoadingCallTypes(false);
  }
};
```

---

## 🧪 Testing Plan

### Test 1: Call Type Fetching
1. Upload documents for a service user in the database
2. Click "Find Call Types"
3. ✅ Should show Morning, Tea, Bed, Domestic (or whatever they have)

### Test 2: Generate Morning Care Plan
1. Select "Morning" call type
2. Click "Generate Care Plan"
3. ✅ Should generate ONLY morning tasks (wake up, breakfast, meds, washing, dressing)
4. ✅ Should NOT include bedtime or domestic tasks
5. ✅ Output should be first-person: "I wake up at..."
6. ✅ Single content block, not multiple sections

### Test 3: Generate Multiple Call Types
1. Generate "Morning" care plan
2. Switch to "Bed" call type
3. Generate "Bed" care plan
4. ✅ Should have both plans stored
5. ✅ Switching between tabs shows different content
6. ✅ Each is call-type specific

### Test 4: No Call Types Found
1. Upload documents for service user NOT in database
2. Click "Find Call Types"
3. ✅ Should show "No call types found" message
4. ✅ Fallback: Generate general care plan (no call type parameter)

---

## 📊 Database Schema Reference

Call types come from `serviceOrders` table:

```sql
CREATE TABLE service_orders (
  id SERIAL PRIMARY KEY,
  service_user_key TEXT,
  service_user_name TEXT,
  call_type_label TEXT, -- "Morning", "Lunch", "Tea", "Bed", "Domestic", etc.
  time_band TEXT, -- "06:00-10:00"
  days_per_week INTEGER,
  service_requirement_minutes INTEGER,
  carers_required INTEGER
);
```

Match by `service_user_name` (fuzzy match) to find all call types for that person.

---

## 🎯 Expected User Experience

### Before (Old System)
- Generate ONE big care plan with 10+ sections
- No distinction between morning/evening/domestic tasks
- Generic recommendations

### After (New System)
1. **Upload documents** → Click "Find Call Types" button
2. **View call types** → "Morning, Tea, Bed, Domestic" pills shown
3. **Select "Morning"** → Click "Generate Morning Care Plan"
4. **Receive Morning plan** → "I wake up at 7am. My carers help me with..."
5. **Select "Bed"** → Click "Generate Bed Care Plan"
6. **Receive Bed plan** → "In the evening, my carers help me prepare for bed..."
7. **Toggle between plans** → Tabs show Morning | Bed | Domestic

---

## 🔑 Key Benefits

✅ **Call-type specific**: Morning care plan doesn't mention bedtime routines  
✅ **Database-driven**: Automatically detects what calls the service user receives  
✅ **Scalable**: Can have 2 call types or 10 - works either way  
✅ **CQC compliant**: Follows 2024 person-centred care standards  
✅ **First-person**: Dignity-respecting language throughout  
✅ **Evidence-based**: Only includes tasks documented in care assessments  

---

## 🚀 Next Steps

1. Complete the UI implementation (30-45 minutes)
2. Test with real service user data
3. Adjust call type labels if database uses different naming
4. Add "Generate All Call Types" batch option if needed
5. Add export functionality per call type

---

*Backend: ✅ Complete | Frontend Logic: ✅ 70% Complete | UI: 🚧 30% Remaining*
