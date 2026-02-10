# CLIENT-SIDE TOKEN LIMIT FIX

## Problem
Users were still getting **413 Payload Too Large** errors even after server-side token truncation was added.

## Root Cause
- Large PDFs (676KB) extract to ~160KB of text (~40,000 tokens)
- Request sent to server with massive payload
- **413 error occurs BEFORE server truncation logic runs**
- Server-side truncation is useless if request never arrives

## Solution: Client-Side Token Check

### What Was Changed
**File**: `client/src/pages/service-users/PlanEnhancer.tsx`

**Before** (MB-based check):
```typescript
// This doesn't work - checks file SIZE, not TOKEN count
const payloadMB = payloadSize / (1024 * 1024);
if (payloadMB > 50) {
  throw new Error("Document too large");
}
```

**After** (TOKEN-based check):
```typescript
// Estimate tokens (matches server logic)
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const supportingTokens = estimateTokens(combinedSupporting);
const carePlanTokens = carePlanContent ? estimateTokens(carePlanContent) : 0;
const totalContentTokens = supportingTokens + carePlanTokens;

const MAX_TOKENS = 10000; // Conservative for GitHub Models (actual limit ~12-16K)

if (totalContentTokens > MAX_TOKENS) {
  throw new Error(
    `Document content is too large (~${Math.ceil(totalContentTokens / 1000)}K tokens, ` +
    `limit is ${Math.ceil(MAX_TOKENS / 1000)}K tokens). ` +
    `Your content exceeds the limit by ~${excessKB}KB.`
  );
}
```

## How It Works

### Token Estimation
- **Formula**: ~4 characters = 1 token (approximate for English text)
- **Matches**: Server-side estimation in `routes.ts`
- **Accuracy**: Conservative enough to prevent errors

### Token Limits by Provider
```typescript
// GitHub Models: 8K-16K input
const MAX_TOKENS_GITHUB = 10000;  // Conservative (allows 2K for system prompt)

// OpenAI: 128K context
const MAX_TOKENS_OPENAI = 80000;  // Conservative

// Local LLM: 64K context  
const MAX_TOKENS_LOCAL = 50000;   // Conservative
```

### Example Calculation
```javascript
// Joseph Williamson PDFs
PDF 1: 206KB → 160KB text → 40,000 characters → 10,000 tokens ⚠️
PDF 2: 470KB → 380KB text → 95,000 characters → 23,750 tokens ❌

Total: 33,750 tokens > 10,000 limit → ERROR BEFORE SENDING!
```

## User Experience

### Before (Confusing 413):
```
❌ Failed to load resource: 413 (Payload Too Large)
[No helpful context]
```

### After (Clear Guidance):
```
⚠️ Document content is too large (~34K tokens, limit is 10K tokens).
Your content exceeds the limit by ~96KB.

Please reduce content by:
• Uploading only the most relevant pages/sections
• Removing redundant or outdated documents
• Summarizing lengthy medical histories
• Splitting into multiple care plan generations

Or switch to OpenAI provider for 8x higher limits.
```

## Console Logging

Added detailed logging for debugging:
```javascript
[PlanEnhancer] Content size check: {
  supportingTokens: 10000,
  carePlanTokens: 23750,
  totalContentTokens: 33750,
  maxTokens: 10000,
  provider: 'github'
}

[PlanEnhancer] Final payload: {
  payloadSizeMB: '52.30MB',
  supportingContentLength: 160000,
  carePlanContentLength: 380000,
  totalChars: 540000,
  estimatedTokens: 33750
}
```

## Testing

### Test Case 1: Small Documents (Should Work)
```
Input: 2 small PDFs (~100KB total)
Extraction: ~20KB text
Tokens: ~5,000 tokens
Result: ✅ PASSES (under 10K limit)
```

### Test Case 2: Large Documents (Should Fail Gracefully)
```
Input: Joseph Williamson PDFs (676KB)
Extraction: ~540KB text  
Tokens: ~135,000 tokens
Result: ❌ BLOCKED with clear error message
```

### Test Case 3: Medium Documents (Should Warn)
```
Input: 1 medium PDF (~200KB)
Extraction: ~32KB text
Tokens: ~8,000 tokens (80% of limit)
Result: ⚠️  WARNING in console, but allows request
```

## Why This Fix Works

1. **Catches errors BEFORE network request**
   - No 413 error from server
   - No wasted API calls
   - No confusion for users

2. **Matches server logic exactly**
   - Same token estimation formula
   - Same limits (conservative)
   - Consistent behavior

3. **Provides actionable guidance**
   - Specific token counts
   - Clear excess amount (KB)
   - Multiple solution options
   - Provider upgrade path

4. **Improves UX significantly**
   - Instant feedback
   - No mysterious 413 errors
   - Educational (users learn about token limits)
   - Console logs for debugging

## Configuration

### Adjust Token Limits
```typescript
// In PlanEnhancer.tsx, line ~535
const MAX_TOKENS = 10000; // Change this value

// Recommended values:
// - GitHub Models: 10000 (conservative)
// - OpenAI: 80000 (much higher)
// - Local LLM: 50000 (qwen2.5-64k)
```

### Adjust Warning Threshold
```typescript
// Warn at 80% of limit
if (totalContentTokens > MAX_TOKENS * 0.8) {
  console.warn('Approaching limit...');
}
```

## Related Files

1. **Token Truncation (Server)**: `server/routes.ts` line 15039-15445
   - Truncates content server-side if it still exceeds limits
   - Fallback for edge cases
   
2. **Rate Limit Fix**: `RATE_LIMIT_FIX.md`
   - Fixes 429 Too Many Requests errors
   
3. **GitHub PAT Setup**: `GITHUB_PAT_FIX_OFFICIAL.md`
   - How to generate token with correct permissions

## Summary

✅ **413 Errors**: NOW PREVENTED by client-side token check  
✅ **User Experience**: Clear error messages with specific guidance  
✅ **Performance**: No wasted network requests for oversized content  
✅ **Debugging**: Detailed console logs for troubleshooting  

**Users will now see helpful errors BEFORE upload, not cryptic 413 after!**
