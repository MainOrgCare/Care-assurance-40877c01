# CareAssurance - Cost Data Sheet

## Executive Summary

This document outlines all operational costs for running CareAssurance in production, with comprehensive ROI analysis comparing manual labor costs to automated AI processing. All costs shown in British Pounds (£).

**Exchange Rate Used:** £1 = $1.27

---

## 1. Labor Cost Comparison (The Big Picture)

### Manual Processing Costs (at £15/hour)

| Task | Manual Time | Labor Cost | App Cost | Savings | Saving % |
|------|-------------|------------|----------|---------|----------|
| EMAR Audit | 45 min | £11.25 | £0.02 | £11.23 | 99.8% |
| Visit Audit | 30 min | £7.50 | £0.01 | £7.49 | 99.9% |
| Risk Assessment | 3 hours | £45.00 | £0.02 | £44.98 | 99.9% |
| Plan Enhancer | 2 hours | £30.00 | £0.06 | £29.94 | 99.8% |
| Care Planner | 1.5 hours | £22.50 | £0.03 | £22.47 | 99.9% |

### Annual Savings Projections

| Facility Size | Monthly Volume | Annual Manual Cost | Annual App Cost | Annual Savings |
|---------------|----------------|--------------------|-----------------| --------------|
| Small (5 users) | 20 EMARs, 10 plans | £5,400 | £1.50 | **£5,398** |
| Medium (15 users) | 60 EMARs, 30 plans | £16,200 | £4.50 | **£16,195** |
| Large (30 users) | 150 EMARs, 80 plans | £43,200 | £12.00 | **£43,188** |

### Time Savings Per Task

| Task | Manual Time | App Time | Time Saved |
|------|-------------|----------|------------|
| EMAR Audit | 45 min | ~60 sec | 44 min |
| Visit Audit | 30 min | ~20 sec | 29.67 min |
| Risk Assessment | 3 hours | ~45 sec | 2 hr 59 min |
| Plan Enhancer | 2 hours | ~90 sec | 1 hr 58.5 min |
| Care Planner | 1.5 hours | ~45 sec | 1 hr 29 min |

---

## 2. Virus Scanning (Cloudmersive)

Protects all file uploads from malware threats.

| Tier | Monthly Cost | API Calls/Month | Cost per Scan |
|------|--------------|-----------------|---------------|
| **Free** | £0 | 600 calls | £0.00 |
| Basic | £15.75 | 20,000 calls | £0.001 |
| Medium Business | £551.18 | 700,000 calls | £0.001 |
| Enterprise | Custom | Unlimited | Contact sales |

**Current Usage:** Free tier (600 scans/month)

**Notes:**
- Free tier has 1 concurrent request limit
- Hash caching implemented to reduce duplicate scans
- Identical files are not re-scanned (24-hour cache)

---

## 3. AI Processing (OpenAI API)

### Models Used in CareAssurance

| Model | Where Used | Input Cost | Output Cost |
|-------|-----------|------------|-------------|
| **GPT-5.1** | EMAR analysis, Care plans, Plan enhancement | £0.98/1M tokens | £7.87/1M tokens |
| **o3** | Risk analysis, Email assistant | £1.57/1M tokens | £6.30/1M tokens |

### Feature Cost Breakdown

| Feature | Model | Avg Tokens (In/Out) | Est. Cost per Use |
|---------|-------|---------------------|-------------------|
| EMAR Analysis (per page, 5-pass) | GPT-5.1 | ~5,000 / ~3,400 | ~£0.03 |
| Care Plan Generation | GPT-5.1 | ~2,000 / ~4,000 | ~£0.03 |
| Plan Enhancement (11 sections) | GPT-5.1 | ~3,000 / ~8,000 | ~£0.06 |
| Risk Analysis | o3 | ~2,000 / ~3,000 | ~£0.02 |
| Email Rewrite | o3 | ~500 / ~800 | ~£0.01 |

### Monthly AI Cost Estimates

| Usage Level | Description | Est. Monthly Cost |
|-------------|-------------|-------------------|
| Low | 10 EMARs + 5 care plans + 5 risk assessments | ~£0.50 |
| Medium | 50 EMARs + 20 care plans + 20 risk assessments | ~£2.20 |
| High | 200 EMARs + 100 care plans + 100 risk assessments | ~£9.50 |
| Very High | 500+ EMARs + 250 care plans + 200 risk assessments | ~£25.00 |

---

## 4. Database (Neon PostgreSQL via Replit)

| Resource | Free Allowance |
|----------|---------------|
| Storage | 0.5 GB per branch |
| Compute | 100 CU-hours/month |
| Data Transfer | 5 GB/month |

**Paid Tiers (If Needed):**

| Plan | Monthly Cost | Storage | Compute |
|------|--------------|---------|---------|
| Launch | £15/month | 10 GB | 300 CU-hours |
| Scale | £54/month | 50 GB | 750 CU-hours |

**Current Status:** Free tier sufficient for most care facilities

---

## 5. Hosting & Deployment (Replit)

### Deployment Options

| Type | Monthly Cost | Best For |
|------|--------------|----------|
| **Autoscale** | £0.79/month + usage | Variable traffic |
| Reserved VM (Shared) | £15.75/month | Small production apps |
| Reserved VM (Dedicated) | £31.50-126/month | Larger needs |

### Recommended Configuration

| Facility Size | Deployment Type | Est. Monthly Cost |
|---------------|-----------------|-------------------|
| Small (1-5 users) | Autoscale | £1-4/month |
| Medium (5-20 users) | Autoscale or Shared VM | £4-20/month |
| Large (20+ users) | Reserved VM | £32-63/month |

### Replit Plan Credits

| Plan | Monthly Credits | Notes |
|------|-----------------|-------|
| Core | £19.69/month | Covers basic deployment |
| Teams | £31.50/user/month | Better for organizations |

---

## 6. Total Monthly Cost Summary

### Scenario A: Small Facility

| Service | Monthly Cost |
|---------|--------------|
| Virus Scanning | £0 (free tier) |
| OpenAI API | ~£0.50-1.50 |
| Database | £0 (free tier) |
| Hosting | ~£1-4 |
| **Total** | **£1.50-5.50/month** |

**vs Manual Labor:** £450/month (saving **£444+/month**)

### Scenario B: Medium Facility

| Service | Monthly Cost |
|---------|--------------|
| Virus Scanning | £0-16 |
| OpenAI API | ~£2-8 |
| Database | £0 (free tier) |
| Hosting | ~£4-20 |
| **Total** | **£6-44/month** |

**vs Manual Labor:** £1,350/month (saving **£1,306+/month**)

### Scenario C: Large Facility

| Service | Monthly Cost |
|---------|--------------|
| Virus Scanning | £16 (Basic plan) |
| OpenAI API | ~£12-32 |
| Database | £0-15 |
| Hosting | ~£32-63 |
| **Total** | **£60-126/month** |

**vs Manual Labor:** £3,600/month (saving **£3,474+/month**)

---

## 7. ROI Analysis

### Break-Even Analysis

| Scenario | Monthly App Cost | Labor Saved | ROI |
|----------|------------------|-------------|-----|
| Small Facility | £5.50 | £450 | **8,082%** |
| Medium Facility | £44 | £1,350 | **2,968%** |
| Large Facility | £126 | £3,600 | **2,757%** |

### First-Year Savings

| Facility Size | Annual App Cost | Annual Labor Saved | Net Savings |
|---------------|-----------------|--------------------| ------------|
| Small | £66 | £5,400 | **£5,334** |
| Medium | £528 | £16,200 | **£15,672** |
| Large | £1,512 | £43,200 | **£41,688** |

---

## 8. Cost Per Service User

Assuming average 10 service users per facility:

| Cost Type | Per User/Month | Per User/Year |
|-----------|----------------|---------------|
| Manual Processing | £45.00 | £540.00 |
| App Processing | £0.55 | £6.60 |
| **Savings** | **£44.45** | **£533.40** |

---

## 9. AI Model Summary

### EMAR Extraction Strategy
- Uses **5-pass GPT-5.1 extraction** with consensus voting (upgraded from 3-pass)
- When passes disagree: uses **highest valid count** (no o3 escalation)
- Domain validation ensures only valid entries are accepted
- Higher accuracy with more data points for consensus (3+ passes agreeing = strong consensus)
- Note: ~67% more API calls per medication compared to previous 3-pass approach

### Models by Feature

| Model | Features |
|-------|----------|
| **GPT-5.1** | EMAR analysis, Care plans, Plan enhancement |
| **o3** | Risk analysis, Email assistant |

---

## 10. API Keys Required

| Service | Secret Name | How to Get |
|---------|-------------|------------|
| OpenAI | OPENAI_API_KEY | platform.openai.com |
| Cloudmersive | CLOUDMERSIVE_API_KEY | cloudmersive.com |

---

## 11. Cost Optimization Built-In

1. **Virus Scanning:** Hash caching prevents duplicate scans
2. **AI Processing:** GPT-5.1 used where possible (cheaper than o3)
3. **Caching:** 90% discount on cached AI inputs
4. **Database:** Scale-to-zero during inactive periods
5. **Hosting:** Autoscale only charges when in use

---

*Last Updated: December 2025*

*Note: Prices subject to change. £1 = $1.27 used for conversions.*
