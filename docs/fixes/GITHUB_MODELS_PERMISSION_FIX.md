# Fix GitHub Models Permission Error

## Problem
Error: `The 'models' permission is required to access this endpoint`

Your GitHub PAT exists but lacks the specific **GitHub Models** permission scope.

## Solution

### Step 1: Generate New PAT with Correct Permissions

1. Go to: https://github.com/settings/personal-access-tokens/new

2. **Configure Token:**
   - **Token name**: `CareAssurance AI Models Access`
   - **Expiration**: 60-90 days (your choice)
   - **Repository access**: All repositories (or specific ones if needed)

3. **Set Required Permission (CRITICAL):**
   - Scroll down to **"Account permissions"** section
   - Find **"GitHub Models"** row
   - Change dropdown from "No access" to **"Read-only"** ✅
   
   **Note:** This is NOT "user:read" - it's a separate "GitHub Models" permission!

4. Click **"Generate token"** at bottom
5. **COPY THE TOKEN IMMEDIATELY** (you can't see it again!)

### Step 2: Update PAT in CareAssurance

1. Open CareAssurance app
2. Go to **Super Secret Admin Portal** (bottom right menu)
3. Click **"AI Optimization"** tab
4. Find **"GitHub Personal Access Token (PAT_AI_KEY)"** field
5. Paste your new token
6. Click **"Save AI Settings"**
7. Refresh the page

### Step 3: Test

1. Try any AI feature (e.g., Plan Enhancer, Risk Assessment)
2. Check server console - should see API calls succeed
3. Debug logging will show content being sent to AI

## Technical Details

- **Endpoint**: `models.inference.ai.azure.com`
- **Required Scope**: `user_models: read`
- **Location in Code**: `server/services/aiClient.ts` lines 315, 335
- **Environment Variable**: `PAT_AI_KEY`

## Common Mistakes

❌ **Wrong Permission**: Using "user:read" instead of "GitHub Models: Read-only"
❌ **Expired Token**: Token expired, need to regenerate
❌ **Not Saved**: Token generated but not saved in Admin Portal
❌ **Wrong Field**: Token saved in wrong field (use PAT_AI_KEY field)

## Verify It's Working

Success indicators:
- ✅ No "models permission required" errors in console
- ✅ AI generation requests complete successfully
- ✅ Server logs show OpenAI API responses (not errors)
- ✅ Debug logging shows content being processed

## Still Not Working?

Check these:
1. Token copied completely (no spaces/truncation)
2. Saved in correct field in Admin Portal
3. Page refreshed after saving
4. GitHub Models permission is specifically enabled (not just user permissions)
5. Server restarted if needed: `npm run dev`
