# GitHub PAT Fix - Official Documentation

## The Problem
Your GitHub Personal Access Token (PAT) is returning a **401 error** because it's missing the required permission scope for GitHub Models API.

## The Required Permission

According to GitHub's official documentation, the GitHub Models API requires:

- **Token Type**: Fine-grained personal access token (NOT classic)
- **Account Permission**: `user_models` with **read** access
- This appears in the GitHub UI as "**Models**" permission

## Step-by-Step Fix

### Option 1: Use GitHub's Pre-filled Template (FASTEST)

Click this link to create a token with the correct permission pre-selected:

🔗 **https://github.com/settings/personal-access-tokens/new?name=GitHub+Models+token&description=Used%20to%20call%20GitHub%20Models%20APIs&user_models=read**

This will:
- Set the token name to "GitHub Models token"
- Pre-select the `user_models: read` permission
- Add a helpful description

Then:
1. Review the pre-filled settings
2. Set expiration (recommend 90 days for testing)
3. Click **"Generate token"**
4. Copy the token (you'll only see it once!)

### Option 2: Manual Creation

1. Go to: https://github.com/settings/personal-access-tokens/new

2. Fill in:
   - **Token name**: `GitHub Models Token`
   - **Expiration**: 90 days (or your preference)
   - **Description**: `For GitHub Models API access`

3. **Resource owner**: Select your username (NOT an organization)

4. **Repository access**: Select "Public Repositories (read-only)" (minimal needed)

5. Scroll to **Account permissions** section

6. Find "**Models**" in the list

7. Click the dropdown next to "Models" and select **"Read-only"**

8. Click **"Generate token"**

9. **COPY THE TOKEN IMMEDIATELY** (it only shows once!)

## Update Your Environment

Once you have the new token:

```bash
# Open your .env file
nano /workspaces/Care-assurance-40877c01/.env

# Update these two lines:
PAT_AI_KEY=github_pat_YOUR_NEW_TOKEN_HERE
AI_ENABLED=true

# Save with Ctrl+X, then Y, then Enter
```

## Restart the Server

```bash
# Stop the current server (Ctrl+C in the terminal running it)
# Then restart:
npm run dev
```

## Test It Works

```bash
# Run the diagnostic script
bash /workspaces/Care-assurance-40877c01/check-ai-status.sh
```

You should see:
- ✅ Has GitHub PAT: true
- ✅ Provider Configured: true
- ✅ AI Enabled: true

## Why This Specific Permission?

From GitHub's documentation:

> "Create a GitHub personal access token. The token needs to have `models:read` permissions."

Source: https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models#experimenting-with-ai-models-using-the-api

The `user_models` permission enables your application to:
- Call the GitHub Models inference API at `models.inference.ai.azure.com`
- Access free tier rate limits (15 requests/min for low-tier models)
- Experiment with GPT-4o, Llama, Mistral, and other models

## Production Security

✅ **Your token is secure in production**:
- Tokens are stored server-side as environment variables
- Never exposed to the browser
- Never included in client-side JavaScript
- Render.com encrypts environment variables at rest

## Rate Limits (Free Tier)

With the correct PAT, you get:
- **Low-tier models**: 15 requests/min, 150/day
- **High-tier models**: 10 requests/min, 50/day
- **Tokens per request**: 8K input, 4K output

For production scale, upgrade to paid Azure AI: https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models#going-to-production

---

## Quick Summary

1. **Click**: https://github.com/settings/personal-access-tokens/new?user_models=read
2. **Generate token** with `user_models: read` permission
3. **Copy** the token (shows only once!)
4. **Update** `.env`: `PAT_AI_KEY=your_new_token` and `AI_ENABLED=true`
5. **Restart** server: `npm run dev`
6. **Test**: Risk Assessment or Plan Enhancer should work!

**This is the official GitHub requirement - no workarounds needed!**
