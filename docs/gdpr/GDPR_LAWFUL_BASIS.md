# UK GDPR Lawful Basis Documentation

## AI-Assisted Care Planning System

**Document Version:** 1.0  
**Date:** February 2026  

---

## 1. Overview

This document records the lawful bases for processing personal data in our AI-assisted care planning system, as required by UK GDPR Article 5(2) (Accountability).

---

## 2. Lawful Bases by Processing Activity

### 2.1 General Care Data Processing

| Processing Activity | Lawful Basis | GDPR Article |
|---------------------|--------------|--------------|
| Storing user accounts | Contract | Art. 6(1)(b) |
| Authentication and access | Contract | Art. 6(1)(b) |
| Session logging | Legal obligation | Art. 6(1)(c) |
| Security monitoring | Legitimate interests | Art. 6(1)(f) |

### 2.2 AI-Assisted Care Planning (Template-Only System)

> **NOTE:** AI template generation is **outside UK GDPR scope** - see Section 7 for details.
> The AI receives anonymized/tokenized data and returns placeholders only.
> No personal data is processed by or returned from the AI service.

| Processing Activity | GDPR Status | Notes |
|---------------------|-------------|-------|
| PII scrubbing (input) | In scope | Local tokenization before AI |
| AI template generation | **EXEMPT** | No personal data in/out |
| Template completion | In scope | Staff manually adds PII |
| Storing completed plans | In scope | Art. 6(1)(b) Contract |

### 2.3 Compliance and Audit

| Processing Activity | Lawful Basis | GDPR Article |
|---------------------|--------------|--------------|
| GDPR audit logging | Legal obligation | Art. 6(1)(c) |
| Consent records | Legal obligation | Art. 6(1)(c) |
| Data retention | Legal obligation | Art. 6(1)(c) |
| Breach notification | Legal obligation | Art. 6(1)(c) |

---

## 3. Legitimate Interests Assessment (LIA)

### 3.1 AI Template Generation - LIA Not Required

Because AI template generation processes **no personal data** (see Section 7), a Legitimate Interests Assessment is **not required** for this activity. The AI receives only anonymized tokens and returns only placeholders.

### 3.2 General System Operations

For non-AI processing activities, our legitimate interests are:

#### Step 1: Identify Legitimate Interest

| Interest | Description |
|----------|-------------|
| **Care Quality** | Improving the consistency and comprehensiveness of care documentation |
| **Efficiency** | Reducing time spent on administrative care planning tasks |
| **Compliance** | Meeting CQC inspection requirements for care plan quality |
| **Safety** | Ensuring all risks and care needs are identified and documented |

#### Step 2: Necessity Test

| Question | Answer |
|----------|--------|
| Is AI processing necessary? | Yes - manual methods alone cannot achieve same quality consistently |
| Could purpose be achieved without processing? | No - alternative would be resource-intensive and less effective |
| Is processing proportionate? | Yes - minimum data processed, strong privacy protections |

#### Step 3: Balancing Test

| Data Subject Impact | Mitigation |
|---------------------|------------|
| Privacy concerns about AI | PII tokenization ensures no personal data reaches AI |
| Loss of control | Users can opt out; manual alternatives available |
| Unexpected use | Clear privacy notice; consent required for health data |
| Professional concerns | AI is assistive only; staff retain decision-making |

**Outcome:** The legitimate interests of improving care quality outweigh the limited impact on data subjects, especially given the strong technical protections in place.

---

## 4. Consent Requirements (Simplified)

### 4.1 AI Template Generation - No Consent Required

Because our AI system uses **template-only outputs** (see Section 7):

| Requirement | Status |
|-------------|--------|
| Explicit consent for AI processing | **Not required** - no PII processed |
| Data Processing Agreement with OpenAI | **Not required** - anonymous data only |
| DPIA for AI processing | **Simplified** - low risk |

### 4.2 Other Processing - Standard GDPR Applies

For non-AI processing activities that still handle personal data:

| Processing Activity | Lawful Basis |
|---------------------|---------------|
| User accounts | Contract - Art. 6(1)(b) |
| Care record storage | Contract - Art. 6(1)(b) |
| Audit logging | Legal obligation - Art. 6(1)(c) |
| Staff completing templates with PII | Contract - Art. 6(1)(b) |

### 4.3 Consent Records

For activities requiring consent, all decisions are logged with:
- User ID and username
- Consent type granted/withdrawn
- Timestamp
- IP address
- Version of consent policy

---

## 5. Article 9 - Special Category Data

### 5.1 AI Processing - Not Applicable

Because our AI uses **template-only outputs**, Article 9 (special category data) requirements **do not apply** to AI processing. The AI never sees health data - it receives and returns anonymous tokens/placeholders only.

### 5.2 Care Record Storage - Standard Processing

For storing completed care plans (after staff adds personal data), we rely on:

| Condition | Article | Applicability |
|-----------|---------|---------------|
| Provision of health/social care | Art. 9(2)(h) | Primary care delivery |
| Public interest in public health | Art. 9(2)(i) | Care quality monitoring |
| Archiving in public interest | Art. 9(2)(j) | Historical care records |

However, for AI-assisted processing specifically, we default to **explicit consent** to provide maximum transparency and control.

---

## 6. Transparency Requirements

### 6.1 Privacy Notice

Our privacy notice ([GDPR_PRIVACY_NOTICE.md](./GDPR_PRIVACY_NOTICE.md)) includes:

- [x] Identity and contact details of controller
- [x] Contact details of DPO
- [x] Purposes and legal basis for processing
- [x] Legitimate interests pursued
- [x] Categories of personal data
- [x] Recipients or categories of recipients
- [x] International transfers and safeguards
- [x] Retention periods
- [x] Data subject rights
- [x] Right to withdraw consent
- [x] Right to complain to ICO
- [x] Automated decision-making information

### 6.2 Just-in-Time Notices

Before AI processing, users see:
- Brief explanation of what will be processed
- Confirmation that PII is protected
- Link to full privacy notice

---

## 7. Template Outputs & Manual Data Entry

### 7.1 GDPR-Exempt Template System

AI outputs contain **no personal data** - only placeholder markers that staff manually populate. This approach is **outside UK GDPR scope** as the AI never processes or returns identifiable information.

### 7.2 Output Placeholders

| Placeholder | Data to Enter | Example |
|-------------|---------------|---------|
| `[Name]` | Service user's full name | John Smith |
| `[NHS Number]` | 10-digit NHS number | 123 456 7890 |
| `[NI Number]` | National Insurance number | AB123456C |
| `[Date of Birth]` | DOB in DD/MM/YYYY format | 15/03/1945 |
| `[Age]` | Current age in years | 80 |
| `[Postcode]` | Full UK postcode | SW1A 1AA |
| `[Address]` | Full address | 10 Downing Street, London |
| `[Phone]` | Contact telephone number | 07700 900123 |
| `[Email]` | Email address | name@example.com |
| `[Staff Member]` | Care worker name | Jane Doe |
| `[Healthcare Professional]` | GP/Nurse/Therapist name | Dr. A. Brown |
| `[Contact Number]` | Emergency contact number | 020 7946 0958 |
| `[Date]` | Relevant date | 06/02/2026 |

### 7.3 How to Complete Templates

**Step 1:** Generate AI template (placeholders only)

**Step 2:** Review the template output for appropriateness

**Step 3:** Replace each placeholder with actual data:

```
BEFORE (AI Output):
"[Name] requires assistance with mobility. Contact [Healthcare Professional] 
if [Name]'s condition changes. Medication administered at [Date]."

AFTER (Manual Entry):
"John Smith requires assistance with mobility. Contact Dr. A. Brown 
if John Smith's condition changes. Medication administered at 06/02/2026."
```

**Step 4:** Save the completed document to the care record

### 7.4 Data Entry Reference Form

Use this form to prepare data before completing templates:

| Field | Value |
|-------|-------|
| Service User Name | _________________________ |
| NHS Number | _________________________ |
| Date of Birth | __ / __ / ________ |
| Address | _________________________ |
| Postcode | _________________________ |
| Phone Number | _________________________ |
| GP Name | _________________________ |
| Key Worker | _________________________ |
| Emergency Contact | _________________________ |

### 7.5 Why This Approach

| Benefit | Description |
|---------|-------------|
| **GDPR Exempt** | No personal data in AI processing = no GDPR obligations for AI |
| **Full Control** | Staff decide what personal data to add |
| **Audit Trail** | AI output is template; staff add data locally |
| **No Data Breach Risk** | Even if AI logs were accessed, no PII present |
| **Simplified Compliance** | No consent needed for template generation |

---

## 8. Legal Obligation References

| Processing | Legal Requirement |
|------------|-------------------|
| Care records retention | Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, Regulation 17 |
| Security measures | UK GDPR Article 32 |
| Breach notification | UK GDPR Articles 33-34 |
| DPIA completion | UK GDPR Article 35 |
| Records of processing | UK GDPR Article 30 |
| DPO appointment | UK GDPR Articles 37-39 |

---

## 9. Review and Updates

| Review Type | Frequency | Last Review | Next Review |
|-------------|-----------|-------------|-------------|
| Lawful basis review | Annually | Feb 2026 | Feb 2027 |
| Consent mechanism review | Annually | Feb 2026 | Feb 2027 |
| LIA review | When processing changes | Feb 2026 | As needed |
| Article 9 conditions | Annually | Feb 2026 | Feb 2027 |

---

## 10. Sign-Off

| Role | Name | Date |
|------|------|------|
| Data Protection Officer | | |
| Legal Advisor | | |
| Senior Information Risk Owner (SIRO) | | |

---

**Document Version:** 1.0  
**Last Updated:** February 2026
