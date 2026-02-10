# Fix GitHub Models 401 Error

## The Problem
Your GitHub Personal Access Token (PAT) doesn't have the "models" permission scope.

## The Solution

### Step 1: Generate New GitHub PAT
1. Go to: **https://github.com/settings/tokens/new**
2. **Token name**: `Care Assurance AI Models`
3. **Expiration**: Choose your preferred duration (90 days recommended)
4. **Select scopes**: ✅ Check **"Model" or "Copilot"** checkbox
   - Look for the "GitHub Models" or "AI Models" permission
   - This gives access to `models.inference.ai.azure.com`

### Step 2: Copy the Token
After clicking "Generate token", GitHub shows it **once** - copy it immediately!
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Update Environment Variable

**In Render Dashboard:**
1. Go to your `care-assurance-api` service
2. Click "Environment" tab
3. Find `PAT_AI_KEY`
4. Click edit and paste your new token
5. Click "Save Changes"
6. Service will automatically redeploy

**Or in local `.env` file:**
```bash
PAT_AI_KEY=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: Restart & Test
```bash
# Server restarts automatically in Render
# For local: Ctrl+C and npm run dev
```

Test with Risk Assessment or Plan Enhancer - should work now!

---

## GitHub Models Free Tier Limits
- ✅ Free tier: 15 requests/minute, 150 requests/hour
- ✅ Models: GPT-4o, GPT-4o-mini (via Azure OpenAI endpoint)
- ✅ No credit card required
- 🔄 Rate limits reset every hour

For production with >20 users, consider upgrading to GitHub Models Plus or OpenAI.
