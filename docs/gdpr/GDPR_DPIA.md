# Data Protection Impact Assessment (DPIA)

## AI-Assisted Care Planning System

**Document Version:** 1.0  
**Date:** February 2026  
**Organisation:** [Your Organisation Name]  
**Data Protection Officer:** [DPO Name]  
**Assessment Author:** [Author Name]  

---

## 1. Processing Overview

### 1.1 Description of Processing

This system uses artificial intelligence (AI) to assist care workers in generating and enhancing care plans for service users. The AI processing includes:

| Feature | Description | Data Processed |
|---------|-------------|----------------|
| Risk Analysis | Analyzes care documents to identify potential risks | Care notes, health records |
| Care Plan Generation | Creates structured care plans from uploaded documents | Assessment documents, medical history |
| Plan Enhancement | Improves existing care plans with additional detail | Existing care plans, supporting notes |
| Risk Assessment Generation | Generates category-specific risk assessments | Health conditions, care needs |

### 1.2 Purpose of Processing

- **Primary Purpose:** To assist care staff in creating comprehensive, person-centred care documentation that meets CQC 2024 standards
- **Secondary Purpose:** To improve consistency and quality of care planning
- **Legal Basis:** Legitimate interests (Article 6(1)(f)) for care quality improvement; Explicit consent for health data processing (Article 9(2)(a))

### 1.3 Data Controller

[Your Organisation Name]  
[Address]  
ICO Registration: [Number]

### 1.4 Data Processor (AI Provider)

OpenAI, Inc.  
3180 18th Street, San Francisco, CA 94110, USA  
Processing under Standard Contractual Clauses (SCCs)

---

## 2. Necessity and Proportionality

### 2.1 Lawful Basis

| Processing Activity | Lawful Basis | Justification |
|---------------------|--------------|---------------|
| AI care plan generation | Legitimate interests | Essential for care quality; less intrusive alternatives insufficient |
| Health data in AI | Explicit consent | User grants consent before AI processing; can withdraw at any time |
| Audit logging | Legal obligation | UK GDPR Art. 5(2) accountability requirement |
| Data retention | Legal obligation | Care records retention requirements |

### 2.2 Necessity Assessment

**Why AI processing is necessary:**
- Traditional manual care planning is time-consuming and variable in quality
- AI assistance ensures comprehensive coverage of all required care areas
- Reduces risk of missing critical care needs
- Improves CQC inspection outcomes

**Proportionality measures:**
- Only minimum necessary data is processed
- PII is tokenized before AI transmission
- Users can opt out of AI features
- Manual alternatives remain available

---

## 3. Risk Assessment

### 3.1 Identified Risks

| Risk | Likelihood | Impact | Inherent Risk |
|------|------------|--------|---------------|
| PII exposure to AI provider | Medium | High | **HIGH** |
| Incorrect AI recommendations | Medium | Medium | **MEDIUM** |
| Data breach during transmission | Low | High | **MEDIUM** |
| Staff over-reliance on AI | Medium | Medium | **MEDIUM** |
| International data transfer | Medium | Medium | **MEDIUM** |

### 3.2 Risk Mitigations

#### Risk 1: PII Exposure to AI Provider

**Mitigation: PII Vault Tokenization System**

| Control | Description |
|---------|-------------|
| **Tokenization** | All PII replaced with unique tokens before AI transmission |
| **Local Vault** | Original values stored only in request-scoped server memory |
| **Pattern Detection** | 20+ UK-specific PII patterns detected and scrubbed |
| **Categories Scrubbed** | NHS numbers, NI numbers, postcodes, emails, phones, dates, DOBs, ages, names, addresses, bank details, card numbers, driving licenses, passports, vehicle registrations |
| **Restoration** | Tokens replaced with originals after AI response, locally only |
| **No Persistence** | Vault cleared after each request |

**Residual Risk: LOW** - No actual PII transmitted to AI provider

#### Risk 2: Incorrect AI Recommendations

**Mitigation: Human-in-the-Loop**

| Control | Description |
|---------|-------------|
| **Review Required** | All AI output must be reviewed by qualified staff |
| **Edit Capability** | Staff can modify any AI-generated content |
| **Professional Judgment** | AI provides suggestions only; clinical decisions remain with staff |
| **Scope Limits** | AI cannot make medical diagnoses or prescribing decisions |
| **Audit Trail** | All AI-generated content logged for quality review |

**Residual Risk: LOW** - Human oversight ensures appropriate care decisions

#### Risk 3: Data Breach During Transmission

**Mitigation: Security Controls**

| Control | Description |
|---------|-------------|
| **TLS 1.3** | All API calls encrypted in transit |
| **API Key Security** | OpenAI API key stored as environment variable |
| **No Data Storage** | OpenAI API configured for zero data retention |
| **Network Isolation** | Server-to-server communication only |

**Residual Risk: LOW** - Industry-standard encryption and no PII transmitted

#### Risk 4: Staff Over-Reliance on AI

**Mitigation: Training and Policies**

| Control | Description |
|---------|-------------|
| **Mandatory Training** | Staff trained on appropriate AI use |
| **Policy Documentation** | Clear guidelines on AI as assistive tool |
| **Quality Checks** | Supervisor review of AI-assisted care plans |
| **Competency Assessment** | Staff must demonstrate care planning skills independently |

**Residual Risk: LOW** - Policies and training ensure appropriate use

#### Risk 5: International Data Transfer

**Mitigation: Transfer Safeguards**

| Control | Description |
|---------|-------------|
| **No PII Transfer** | Tokenization ensures no personal data leaves UK |
| **SCCs** | Standard Contractual Clauses with OpenAI |
| **TIA Complete** | Transfer Impact Assessment completed |
| **UK Adequacy** | Processing within UK GDPR framework |

**Residual Risk: LOW** - Only tokenized (non-personal) data transferred

---

## 4. Technical and Organisational Measures

### 4.1 Technical Controls

| Category | Measure | Status |
|----------|---------|--------|
| **Data Minimisation** | PII vault tokenization | ✅ Implemented |
| **Encryption** | TLS 1.3 for all transmissions | ✅ Implemented |
| **Access Control** | Role-based authentication | ✅ Implemented |
| **Audit Logging** | Persistent GDPR audit trail | ✅ Implemented |
| **Input Validation** | Injection protection | ✅ Implemented |
| **Rate Limiting** | API abuse prevention | ✅ Implemented |
| **Security Headers** | Helmet.js protection | ✅ Implemented |

### 4.2 Organisational Controls

| Category | Measure | Status |
|----------|---------|--------|
| **Consent Management** | User consent tracking | ✅ Implemented |
| **Data Subject Rights** | SAR/Erasure endpoints | ✅ Implemented |
| **Retention Policies** | Configurable data lifecycle | ✅ Implemented |
| **Staff Training** | AI usage guidelines | ⏳ Required |
| **DPO Review** | Quarterly DPIA review | ⏳ Required |
| **Incident Response** | Breach notification procedure | ⏳ Required |

---

## 5. Data Subject Rights

### 5.1 Rights Implementation

| Right | Implementation | Endpoint |
|-------|----------------|----------|
| **Right of Access** (Art. 15) | Users can download all their data | `GET /api/gdpr/my-data` |
| **Right to Erasure** (Art. 17) | Users can request data deletion | `POST /api/gdpr/data-request/erasure` |
| **Right to Rectification** (Art. 16) | Users can edit their profile | Profile settings |
| **Right to Restriction** (Art. 18) | Users can withdraw AI consent | `POST /api/gdpr/consent` |
| **Right to Portability** (Art. 20) | Data export in JSON format | `GET /api/gdpr/my-data` |
| **Right to Object** (Art. 21) | Users can opt out of AI features | Consent settings |

### 5.2 Response Timelines

- **Standard requests:** Within 30 days
- **Complex requests:** Up to 90 days with notification
- **Urgent requests:** Prioritised handling

---

## 6. Consultation

### 6.1 Internal Consultation

| Stakeholder | Consulted | Outcome |
|-------------|-----------|---------|
| Data Protection Officer | ☐ | Pending |
| IT Security | ☐ | Pending |
| Care Management | ☐ | Pending |
| Senior Leadership | ☐ | Pending |

### 6.2 ICO Consultation

Prior consultation with the ICO is **not required** because:
- High risks have been adequately mitigated
- Processing is within established legal frameworks
- Technical controls reduce residual risk to acceptable levels

---

## 7. Approval and Sign-Off

### 7.1 DPIA Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| DPO | | | |
| Project Owner | | | |
| IT Security Lead | | | |
| Registered Manager | | | |

### 7.2 Review Schedule

| Review Type | Frequency | Next Due |
|-------------|-----------|----------|
| Full DPIA Review | Annually | February 2027 |
| Technical Controls Audit | Quarterly | May 2026 |
| Consent Rate Monitoring | Monthly | March 2026 |
| Incident Review | As needed | Ongoing |

---

## 8. Appendices

### Appendix A: PII Categories Scrubbed

```
NHS Numbers          (123 456 7890)
NI Numbers           (AB123456C)
UK Postcodes         (SW1A 1AA)
Email Addresses      (name@example.com)
UK Phone Numbers     (07xxx, 01onal, +44)
International Phones (+1, +33, etc.)
Dates                (DD/MM/YYYY, ISO)
Dates of Birth       (DOB:, D.O.B., born)
Ages                 (aged 85, 85 years old)
Street Addresses     (123 High Street)
House Names          (The Cottage, Rose House)
Full Names           (First Last patterns)
Titled Names         (Mr, Mrs, Dr, Prof)
Staff Names          (Carer: Name, Nurse: Name)
UK Sort Codes        (12-34-56)
Bank Account Numbers (8 digits)
Card Numbers         (16 digits)
UK Driving Licenses  (MORGA657054SM9IJ)
UK Passports         (9 digits)
Vehicle Registrations (AB12 CDE)
IP Addresses         (192.168.1.1, IPv6)
MAC Addresses        (AA:BB:CC:DD:EE:FF)
```

### Appendix B: API Endpoints for Compliance

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gdpr/consent` | GET | Get user's consent status |
| `/api/gdpr/consent` | POST | Update consent |
| `/api/gdpr/my-data` | GET | Export user's data |
| `/api/gdpr/data-request/access` | POST | Submit SAR |
| `/api/gdpr/data-request/erasure` | POST | Request deletion |
| `/api/admin/gdpr/data-requests` | GET | List all requests (admin) |
| `/api/admin/gdpr/data-requests/pending` | GET | Pending requests (admin) |
| `/api/admin/gdpr/data-requests/:id/process` | POST | Process request (admin) |
| `/api/admin/gdpr/audit-logs` | GET | View audit logs (admin) |
| `/api/admin/gdpr/retention-policies` | GET/POST | Manage retention (admin) |
| `/api/admin/gdpr/purge/:category` | POST | Run data purge (admin) |

### Appendix C: Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | System | Initial DPIA |

---

**END OF DOCUMENT**
