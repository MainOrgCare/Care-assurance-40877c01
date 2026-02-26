/**
 * PII Vault — UK GDPR-Compliant Reversible De-identification
 *
 * Replaces sensitive data with unique tokens before sending to AI services,
 * stores the token→original mapping in local memory only, and restores
 * original values when the AI response comes back.
 *
 * This ensures:
 * - No PII is transmitted to external AI services
 * - Original data never leaves the local server
 * - Full fidelity restoration for local display
 *
 * @module server/utils/piiVault
 */
import { logSecurityEvent } from "./securityAudit";

// ─────────────────────────────────────────────────────────────────────────
// PII CATEGORIES
// ─────────────────────────────────────────────────────────────────────────

export type PIICategory =
  | "NHS_NUM"
  | "NI_NUM"
  | "POSTCODE"
  | "EMAIL"
  | "PHONE"
  | "DATE"
  | "DOB"
  | "AGE"
  | "ADDRESS"
  | "NAME"
  | "STAFF"
  | "HEALTHCARE_PRO"
  | "CONTACT"
  | "FIELD"
  | "BANK"
  | "CARD"
  | "LICENSE"
  | "PASSPORT"
  | "VEHICLE"
  | "NETWORK";

// ─────────────────────────────────────────────────────────────────────────
// REGEX PATTERNS FOR UK-SPECIFIC PII
// ─────────────────────────────────────────────────────────────────────────

export const PII_PATTERNS = {
  // NHS Number: 10 digits, often formatted as 123 456 7890 or 1234567890
  nhsNumber: /\b\d{3}\s?\d{3}\s?\d{4}\b/g,

  // National Insurance Number: AB123456C format
  niNumber: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,

  // UK Postcode: Full format (SW1A 1AA, EC1A 1BB, etc.)
  ukPostcode: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // UK Phone numbers (various formats)
  ukPhone: /\b(?:(?:\+44\s?|0)(?:7\d{3}|\d{2,4}))\s?\d{3,4}\s?\d{3,4}\b/g,

  // International phone (generic)
  intlPhone: /\b\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}\b/g,

  // Dates in various formats (DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY, etc.)
  dateFormats: /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:19|20)?\d{2}\b/g,

  // ISO dates (YYYY-MM-DD)
  isoDate: /\b(?:19|20)\d{2}[\-\/](?:0?[1-9]|1[0-2])[\-\/](?:0?[1-9]|[12]\d|3[01])\b/g,

  // Age patterns ("aged 85", "85 years old", "85-year-old")
  agePatterns:
    /\b(?:aged?|age)\s*:?\s*\d{1,3}\b|\b\d{1,3}\s*(?:years?|yrs?)\s*(?:old|of age)\b|\b\d{1,3}-?years?-?old\b/gi,

  // Year of birth patterns ("born 1938", "DOB: 1940", "b. 1935")
  yearOfBirth: /\b(?:born|dob|d\.o\.b|b\.)\s*:?\s*(?:19|20)\d{2}\b/gi,

  // UK Sort Code: 12-34-56 or 12 34 56
  ukSortCode: /\b\d{2}[\-\s]\d{2}[\-\s]\d{2}\b/g,

  // UK Bank Account Number: 8 digits preceded by contextual keywords
  ukBankAccount:
    /\b(?:account|acc|a\/c|bank)\s*(?:no|number|num|#|:)?\s*:?\s*\d{8}\b/gi,

  // Credit/Debit Card: 13-19 digits (with optional spaces/dashes)
  cardNumber: /\b(?:\d{4}[\s\-]?){3,4}\d{1,4}\b/g,

  // UK Driving License: MORGA657054SM9IJ format
  ukDrivingLicense: /\b[A-Z]{5}\d{6}[A-Z0-9]{5}\b/gi,

  // UK Passport Number: 9 digits preceded by contextual keyword
  ukPassport: /\b(?:passport)\s*(?:no|number|num|#|:)?\s*:?\s*\d{9}\b/gi,

  // UK Vehicle Registration: AB12 CDE, AB12CDE
  ukVehicleReg: /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/gi,

  // Long-form dates: "15 January 2025", "3rd February 2026", "January 15, 2025"
  longFormDate:
    /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(?:19|20)\d{2}\b/gi,

  // Abbreviated long-form dates: "15 Jan 2025", "3rd Feb 2026"
  shortMonthDate:
    /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(?:19|20)\d{2}\b/gi,

  // IBAN (International Bank Account Number)
  iban: /\b[A-Z]{2}\d{2}\s?[A-Z0-9]{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,4}\b/gi,

  // IP addresses (v4)
  ipAddress:
    /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,

  // IPv6 addresses (simplified pattern)
  ipv6Address: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,

  // Street addresses (number + street name pattern)
  streetAddress:
    /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Street|Lane|Avenue|Drive|Close|Way|Court|Gardens|Grove|Place|Crescent|Terrace|Square|Hill|Park|View|Rise|Walk|Mews|Row)\b/gi,

  // House names with addresses
  houseName:
    /\b(?:The\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:House|Cottage|Lodge|Bungalow|Flat|Apartment|Villa|Manor)\b/gi,

  // MAC addresses (network device identifiers)
  macAddress: /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
};

// ─────────────────────────────────────────────────────────────────────────
// WHITELISTS — terms that resemble PII but should not be scrubbed
// ─────────────────────────────────────────────────────────────────────────

/** Clinical / medical terms that look like proper names */
export const CLINICAL_WHITELIST = new Set([
  "alzheimer", "parkinson", "huntington", "crohn", "addison", "hodgkin",
  "raynaud", "bartholin", "cushing", "graves", "hashimoto", "meniere",
  "paget", "bell", "down syndrome", "turner syndrome", "klinefelter",
  "marfan", "ehlers danlos", "asperger", "guillain barre", "lou gehrig",
  "wilson disease", "bright disease", "dupuytren", "raynaud's", "bell's",
  "alzheimer's", "parkinson's", "huntington's", "crohn's", "addison's",
  "hodgkin's", "cushing's", "graves'", "hashimoto's", "meniere's", "paget's",
  "sjogren", "sjogren's", "barrett", "barrett's", "behcet", "behcet's",
  "bowen", "bowen's", "kaposi", "kaposi's", "reiter", "reiter's",
  "tourette", "tourette's", "wegener", "wegener's", "conn", "conn's",
  "fabry", "fabry's", "gaucher", "gaucher's", "kawasaki",
  "ménière", "ménière's", "sjögren", "sjögren's",
  "waterlow", "barthel", "braden", "norton", "abbey", "malnutrition",
  "must score", "news score", "falls risk", "choking risk",
]);

/** Common medication brand names that look like proper nouns */
export const MEDICATION_WHITELIST = new Set([
  "warfarin", "metformin", "amlodipine", "ramipril", "simvastatin",
  "omeprazole", "levothyroxine", "paracetamol", "codeine", "tramadol",
  "morphine", "fentanyl", "oxycodone", "gabapentin", "pregabalin",
  "sertraline", "fluoxetine", "citalopram", "mirtazapine", "venlafaxine",
  "risperidone", "quetiapine", "olanzapine", "haloperidol", "lorazepam",
  "diazepam", "zopiclone", "insulin", "lantus", "novorapid", "humalog",
  "aspirin", "ibuprofen", "naproxen", "amoxicillin", "cefalexin", "doxycycline",
  "trimethoprim", "nitrofurantoin", "furosemide", "bendroflumethiazide", "bisoprolol",
  "atorvastatin", "apixaban", "rivaroxaban", "clopidogrel", "dalteparin",
  "donepezil", "memantine", "rivastigmine", "galantamine", "levodopa",
  "carbidopa", "ropinirole", "pramipexole", "sinemet", "madopar",
  "salbutamol", "beclometasone", "tiotropium", "budesonide", "montelukast",
  "methotrexate", "hydroxychloroquine", "sulfasalazine", "prednisolone",
  "dexamethasone", "hydrocortisone", "senna", "lactulose", "loperamide",
  "domperidone", "cyclizine", "ondansetron", "co-codamol", "co-dydramol",
  "co-amoxiclav", "flucloxacillin", "clarithromycin", "azithromycin",
  "trazodone", "amitriptyline", "nortriptyline", "duloxetine", "escitalopram",
  "clonazepam", "midazolam", "phenytoin", "carbamazepine", "sodium valproate",
  "levetiracetam", "lamotrigine", "topiramate", "allopurinol", "colchicine",
  "lisinopril", "enalapril", "losartan", "candesartan", "diltiazem", "nifedipine",
  "doxazosin", "tamsulosin", "finasteride", "oxybutynin", "solifenacin",
  "metoclopramide", "ranitidine", "lansoprazole", "esomeprazole", "pantoprazole",
]);

/** Multi-word care-domain phrases that should not be treated as names */
export const CARE_PHRASE_WHITELIST = new Set([
  "care plan", "care worker", "care home", "care needs", "care staff", "care team",
  "care manager", "care coordinator", "care provider", "care assistant", "care support",
  "risk assessment", "personal care", "mental health", "social worker", "social care",
  "general practitioner", "district nurse", "health visitor", "service user",
  "family member", "next of kin", "emergency contact", "key worker",
  "falls prevention", "fire safety", "skin integrity", "medication administration",
  "infection control", "environmental safety", "lone working", "behavior support",
  "communication support", "dementia care", "end of life", "epilepsy management",
  "diabetes management", "nutrition assessment", "continence care", "mobility assessment",
  "moving and handling", "safeguarding adults", "safeguarding children", "coshh assessment",
  "manual handling", "pressure areas", "tissue viability", "wound care",
  "initial assessment", "care planning", "daily living", "personal hygiene", "oral care",
  "food preparation", "medication support", "emotional support", "social activities",
  "blood pressure", "heart rate", "respiratory rate", "oxygen saturation",
  "body temperature", "weight management", "pain management", "symptom control",
  "palliative care", "health and safety", "dignity and respect", "person centred",
  "person centered", "best practice", "quality assurance", "clinical governance",
  "duty of care", "capacity assessment", "mental capacity", "best interests",
  "deprivation of liberty", "advance directive", "lasting power", "power of attorney",
  "hospital discharge", "community nurse", "practice nurse", "occupational therapy",
  "speech therapy", "physical therapy", "blood glucose", "blood sugar",
  "fluid intake", "food intake", "bowel movement", "urinary output",
  "vital signs", "medication review", "medication round", "controlled drug",
  "medication error", "adverse reaction", "allergic reaction", "side effect",
]);

/** Common English words that should not be treated as names */
export const COMMON_ENGLISH_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
  "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its",
  "may", "new", "now", "old", "see", "way", "who", "boy", "did", "own", "say",
  "she", "too", "use", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "morning", "afternoon", "evening", "night", "daily", "weekly", "monthly",
  "this", "that", "with", "have", "from", "they", "been", "will", "more",
  "when", "some", "what", "there", "which", "their", "about", "would", "make",
  "like", "time", "just", "know", "take", "people", "into", "year", "your",
  "good", "could", "them", "other", "than", "then", "look", "only", "come",
  "over", "such", "also", "back", "after", "work", "first", "well", "even",
  "want", "because", "these", "give", "most", "care", "health", "support",
  "need", "needs", "help", "ensure", "provide", "assist", "monitor",
  "check", "review", "assess", "plan", "record", "document", "report",
]);

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

/** Returns `true` if a word is in the clinical or medication whitelist */
export function isClinicalOrMedicalTerm(phrase: string): boolean {
  const lower = phrase.toLowerCase().replace(/['']/g, "'");
  return CLINICAL_WHITELIST.has(lower) || MEDICATION_WHITELIST.has(lower);
}

// ─────────────────────────────────────────────────────────────────────────
// PIIVault ENTRY
// ─────────────────────────────────────────────────────────────────────────

interface PIIVaultEntry {
  token: string;
  original: string;
  category: PIICategory;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────
// PIIVault CLASS
// ─────────────────────────────────────────────────────────────────────────

/**
 * PII Vault — Secure local cache for reversible de-identification.
 *
 * ```ts
 * const vault = new PIIVault();
 * const scrubbed = vault.scrubString(documentContent); // send to AI
 * // ... AI processing ...
 * const restored = vault.restoreString(aiResponse);    // display locally
 * vault.clear();
 * ```
 */
export class PIIVault {
  private entries: Map<string, PIIVaultEntry> = new Map();
  private reverseMap: Map<string, string> = new Map(); // original → token (dedup)
  private counter = 0;
  private readonly prefix: string;
  private readonly createdAt: number;

  constructor() {
    this.prefix = `PII_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    this.createdAt = Date.now();
  }

  // ── Token lifecycle ──────────────────────────────────────────────────

  private generateToken(category: PIICategory): string {
    this.counter++;
    return `{{${this.prefix}_${category}_${this.counter}}}`;
  }

  /** Store a PII value and return its token (deduplicates). */
  store(original: string, category: PIICategory): string {
    const existingToken = this.reverseMap.get(original);
    if (existingToken) return existingToken;

    const token = this.generateToken(category);
    const entry: PIIVaultEntry = { token, original, category, createdAt: Date.now() };
    this.entries.set(token, entry);
    this.reverseMap.set(original, token);
    return token;
  }

  /** Get the original value for a token. */
  get(token: string): string | undefined {
    return this.entries.get(token)?.original;
  }

  /** Check if a string is a vault token belonging to this vault. */
  isToken(str: string): boolean {
    const escaped = this.escapeRegex(this.prefix);
    return new RegExp(`^\\{\\{${escaped}_[A-Z_]+_\\d+\\}\\}$`).test(str);
  }

  // ── Statistics ────────────────────────────────────────────────────────

  getStats(): { total: number; byCategory: Record<PIICategory, number> } {
    const byCategory: Record<PIICategory, number> = {
      NHS_NUM: 0, NI_NUM: 0, POSTCODE: 0, EMAIL: 0, PHONE: 0,
      DATE: 0, DOB: 0, AGE: 0, ADDRESS: 0, NAME: 0, STAFF: 0,
      HEALTHCARE_PRO: 0, CONTACT: 0, FIELD: 0,
      BANK: 0, CARD: 0, LICENSE: 0, PASSPORT: 0, VEHICLE: 0, NETWORK: 0,
    };
    for (const entry of this.entries.values()) byCategory[entry.category]++;
    return { total: this.entries.size, byCategory };
  }

  // ── Scrubbing ────────────────────────────────────────────────────────

  /** Scrub a string, replacing all PII with vault tokens. */
  scrubString(data: string): string {
    let s = data;

    // === PHASE 1: High-confidence PII patterns ===
    s = s.replace(PII_PATTERNS.nhsNumber, (m) => this.store(m, "NHS_NUM"));
    s = s.replace(PII_PATTERNS.niNumber, (m) => this.store(m, "NI_NUM"));
    s = s.replace(PII_PATTERNS.ukPostcode, (m) => this.store(m, "POSTCODE"));
    s = s.replace(PII_PATTERNS.email, (m) => this.store(m, "EMAIL"));
    s = s.replace(PII_PATTERNS.ukPhone, (m) => this.store(m, "PHONE"));
    s = s.replace(PII_PATTERNS.intlPhone, (m) => this.store(m, "PHONE"));

    // Network identifiers
    s = s.replace(PII_PATTERNS.ipAddress, (m) => this.store(m, "NETWORK"));
    s = s.replace(PII_PATTERNS.ipv6Address, (m) => this.store(m, "NETWORK"));
    s = s.replace(PII_PATTERNS.macAddress, (m) => this.store(m, "NETWORK"));

    // Financial information
    s = s.replace(PII_PATTERNS.ukSortCode, (m) => this.store(m, "BANK"));
    s = s.replace(PII_PATTERNS.ukBankAccount, (m) => this.store(m, "BANK"));
    s = s.replace(PII_PATTERNS.cardNumber, (m) => this.store(m, "CARD"));
    s = s.replace(PII_PATTERNS.iban, (m) => this.store(m, "BANK"));

    // Government-issued identifiers
    s = s.replace(PII_PATTERNS.ukDrivingLicense, (m) => this.store(m, "LICENSE"));
    s = s.replace(PII_PATTERNS.ukPassport, (m) => this.store(m, "PASSPORT"));
    s = s.replace(PII_PATTERNS.ukVehicleReg, (m) => this.store(m, "VEHICLE"));

    // Street addresses & house names
    s = s.replace(PII_PATTERNS.streetAddress, (m) => this.store(m, "ADDRESS"));
    s = s.replace(PII_PATTERNS.houseName, (m) => this.store(m, "ADDRESS"));

    // === PHASE 2: Date and age information ===
    s = s.replace(PII_PATTERNS.agePatterns, (m) => this.store(m, "AGE"));
    s = s.replace(PII_PATTERNS.yearOfBirth, (m) => this.store(m, "DOB"));
    s = s.replace(PII_PATTERNS.longFormDate, (m) => this.store(m, "DATE"));
    s = s.replace(PII_PATTERNS.shortMonthDate, (m) => this.store(m, "DATE"));
    s = s.replace(PII_PATTERNS.isoDate, (m) => this.store(m, "DATE"));
    s = s.replace(PII_PATTERNS.dateFormats, (m) => this.store(m, "DATE"));

    // === PHASE 3: Name patterns ===

    // Explicit name introductions
    s = s.replace(
      /\b(my name is|i am called|i'm called|call me|known as|also known as|a\.k\.a\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      (_match, prefix, name) => `${prefix} ${this.store(name, "NAME")}`,
    );

    // === PHASE 4: Labelled PII fields ===
    s = s.replace(
      /\b(DOB|Date of Birth|D\.O\.B\.?)\s*:?\s*([^\n,;]{1,80})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes("{{PII_")) {
          return `${label}: ${trimmed}`;
        }
        return `${label}: ${this.store(trimmed, "DOB")}`;
      },
    );
    s = s.replace(
      /\b(Emergency contact|Next of kin|Contact|Tel|Telephone|Phone|Mobile|Email)\s*:?\s*([^\n,;]{1,120})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes("{{PII_")) {
          return `${label}: ${trimmed}`;
        }
        const hasEmail = new RegExp(PII_PATTERNS.email).test(trimmed);
        const hasPhone = new RegExp(PII_PATTERNS.ukPhone).test(trimmed) || new RegExp(PII_PATTERNS.intlPhone).test(trimmed);
        if (hasEmail) return `${label}: ${this.store(trimmed, "EMAIL")}`;
        if (hasPhone) return `${label}: ${this.store(trimmed, "PHONE")}`;
        return `${label}: ${this.store(trimmed, "CONTACT")}`;
      },
    );
    s = s.replace(
      /\b(Address|Home address|Residence)\s*:?\s*([^\n]{1,160})/gi,
      (_match, label, value) => {
        const trimmed = value.trim();
        if (trimmed.includes("{{PII_")) {
          return `${label}: ${trimmed}`;
        }
        return `${label}: ${this.store(trimmed, "ADDRESS")}`;
      },
    );

    // === PHASE 5: Titled names ===
    s = s.replace(
      /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Professor)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
      (_match, title, name) => {
        const lower = String(title || "").toLowerCase();
        const category: PIICategory =
          lower === "dr" || lower === "prof" || lower === "professor"
            ? "HEALTHCARE_PRO"
            : "NAME";
        return `${title} ${this.store(name, category)}`;
      },
    );

    // === PHASE 6: Staff names ===
    s = s.replace(
      /\b(Carer|Care Worker|Nurse|Doctor|GP|Support Worker|Key Worker|Social Worker)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
      (_match, role, name) => `${role}: ${this.store(name, "STAFF")}`,
    );

    // Possessive patterns not in whitelist
    s = s.replace(/\b([A-Z][a-z]+)['']s\b/g, (match, name) => {
      if (isClinicalOrMedicalTerm(name)) return match;
      if (COMMON_ENGLISH_WORDS.has(name.toLowerCase())) return match;
      return `${this.store(name, "NAME")}'s`;
    });

    // Full name patterns (First Last or First Middle Last)
    s = s.replace(
      /\b([A-Z][a-z]+)\s+((?:O['']|Mc|Mac)?[A-Z][a-z]+)(?:\s+((?:O['']|Mc|Mac)?[A-Z][a-z]+))?\b/g,
      (match, first, second, third, offset, full) => {
        const phrase = match.toLowerCase();
        if (CARE_PHRASE_WHITELIST.has(phrase)) return match;
        if (isClinicalOrMedicalTerm(first) || isClinicalOrMedicalTerm(second)) return match;
        if (third && isClinicalOrMedicalTerm(third)) return match;
        if (COMMON_ENGLISH_WORDS.has(first.toLowerCase())) return match;
        const lowerFirst = String(first).toLowerCase();
        if (["mr", "mrs", "ms", "miss", "dr", "prof", "professor"].includes(lowerFirst)) return match;
        const before = full.slice(Math.max(0, offset - 40), offset);
        if (/\b(Carer|Care Worker|Nurse|Doctor|GP|Support Worker|Key Worker|Social Worker)\s*:?\s*$/i.test(before)) {
          return match;
        }
        return this.store(match, "NAME");
      },
    );

    // All lowercase names (common in informal documents)
    s = s.replace(
      /\b([a-z]{2,})\s+([a-z]{2,})(?:\s+([a-z]{2,}))?\b/g,
      (match, first, second, third) => {
        const phrase = match.toLowerCase();
        if (CARE_PHRASE_WHITELIST.has(phrase)) return match;
        if (COMMON_ENGLISH_WORDS.has(first) && COMMON_ENGLISH_WORDS.has(second)) return match;
        if (isClinicalOrMedicalTerm(first) || isClinicalOrMedicalTerm(second)) return match;
        if (third && isClinicalOrMedicalTerm(third)) return match;

        const contextMatch =
          /(mother|father|son|daughter|granddaughter|grandson|sister|brother|wife|husband|partner|friend|carer|neighbor|neighbour)/i;
        if (contextMatch.test(match)) return this.store(match, "NAME");

        const precedingContext =
          /(present at assessment|attended by|with|seen with|accompanied by):/i;
        const before = s.slice(Math.max(0, s.lastIndexOf(match) - 50), s.lastIndexOf(match));
        if (precedingContext.test(before)) return this.store(match, "NAME");

        if (
          first.length >= 4 &&
          second.length >= 4 &&
          !COMMON_ENGLISH_WORDS.has(first) &&
          !COMMON_ENGLISH_WORDS.has(second)
        ) {
          return this.store(match, "NAME");
        }
        return match;
      },
    );

    return s;
  }

  /** Scrub any data type (string, array, object). */
  scrub(data: any): any {
    if (typeof data === "string") return this.scrubString(data);
    if (Array.isArray(data)) return data.map((item) => this.scrub(item));
    if (typeof data === "object" && data !== null) {
      const scrubbed: Record<string, any> = {};
      for (const key of Object.keys(data)) {
        const lowerKey = key.toLowerCase().replace(/[_\s]/g, "");
        if (
          [
            "name", "fullname", "firstname", "lastname", "surname",
            "email", "phone", "telephone", "mobile", "address",
            "postcode", "nhs", "ninumber", "dob", "dateofbirth",
          ].includes(lowerKey)
        ) {
          scrubbed[key] = this.store(String(data[key]), "FIELD");
        } else {
          scrubbed[key] = this.scrub(data[key]);
        }
      }
      return scrubbed;
    }
    return data;
  }

  // ── Restoration ──────────────────────────────────────────────────────

  /** Restore tokens in a string back to original values. */
  restoreString(data: string): string {
    let restored = data;
    const escaped = this.escapeRegex(this.prefix);
    const tokenPattern = new RegExp(`\\{\\{${escaped}_[A-Z_]+_\\d+\\}\\}`, "g");
    restored = restored.replace(tokenPattern, (token) => {
      const original = this.get(token);
      return original !== undefined ? original : token;
    });
    return restored;
  }

  /** Restore any data type (string, array, object). */
  restore(data: any): any {
    if (typeof data === "string") return this.restoreString(data);
    if (Array.isArray(data)) return data.map((item) => this.restore(item));
    if (typeof data === "object" && data !== null) {
      const restored: Record<string, any> = {};
      for (const key of Object.keys(data)) restored[key] = this.restore(data[key]);
      return restored;
    }
    return data;
  }

  // ── Placeholder conversion ───────────────────────────────────────────

  private static readonly PLACEHOLDERS: Record<string, string> = {
    NHS_NUM: "[NHS Number]",
    NI_NUM: "[NI Number]",
    POSTCODE: "[Postcode]",
    EMAIL: "[Email]",
    PHONE: "[Phone]",
    DATE: "[Date]",
    DOB: "[Date of Birth]",
    AGE: "[Age]",
    ADDRESS: "[Address]",
    NAME: "[Name]",
    STAFF: "[Staff Member]",
    HEALTHCARE_PRO: "[Healthcare Professional]",
    CONTACT: "[Contact Number]",
    FIELD: "[Personal Field]",
    BANK: "[Bank Details]",
    CARD: "[Card Number]",
    LICENSE: "[Driving License]",
    PASSPORT: "[Passport Number]",
    VEHICLE: "[Vehicle Registration]",
    NETWORK: "[Network ID]",
    IP: "[IP Address]",
    MAC: "[MAC Address]",
  };

  /** Convert tokens to human-readable placeholders (no PII returned). */
  toPlaceholdersString(data: string): string {
    const escaped = this.escapeRegex(this.prefix);
    const tokenPattern = new RegExp(`\\{\\{${escaped}_([A-Z_]+)_\\d+\\}\\}`, "g");
    return data.replace(tokenPattern, (_token, category) => {
      return PIIVault.PLACEHOLDERS[category] || "[Redacted]";
    });
  }

  /** Convert any data type to placeholder format. */
  toPlaceholders(data: any): any {
    if (typeof data === "string") return this.toPlaceholdersString(data);
    if (Array.isArray(data)) return data.map((item) => this.toPlaceholders(item));
    if (typeof data === "object" && data !== null) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(data)) result[key] = this.toPlaceholders(data[key]);
      return result;
    }
    return data;
  }

  // ── Memory management ────────────────────────────────────────────────

  /** Clear all stored entries. Call this after each request. */
  clear(): void {
    this.entries.clear();
    this.reverseMap.clear();
  }

  /** Get vault age in milliseconds. */
  getAge(): number {
    return Date.now() - this.createdAt;
  }

  // ── Audit / GDPR ────────────────────────────────────────────────────

  /** Log vault activity for GDPR compliance audit trail. */
  logAudit(
    operation: "SCRUB" | "RESTORE",
    endpoint: string,
    userId?: number | string | null,
    username?: string | null,
  ): void {
    const stats = this.getStats();
    logSecurityEvent({
      eventType: operation === "SCRUB" ? "PII_SCRUB" : "PII_RESTORE",
      endpoint,
      userId: typeof userId === "number" ? userId : null,
      username,
      details: {
        vaultPrefix: this.prefix,
        totalItems: stats.total,
        categories: Object.fromEntries(
          Object.entries(stats.byCategory).filter(([, v]) => v > 0),
        ),
        vaultAgeMs: this.getAge(),
      },
    });
  }

  /** Export vault mapping for client-side restoration (authorized users only). */
  export(): { prefix: string; mapping: Record<string, { original: string; category: PIICategory }> } {
    const mapping: Record<string, { original: string; category: PIICategory }> = {};
    for (const [token, entry] of this.entries) {
      mapping[token] = { original: entry.original, category: entry.category };
    }
    return { prefix: this.prefix, mapping };
  }

  /** Get the vault prefix for pattern matching. */
  getPrefix(): string {
    return this.prefix;
  }

  /** Verify integrity of vault — check for tampering or corruption. */
  verifyIntegrity(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    for (const [token, entry] of this.entries) {
      if (this.reverseMap.get(entry.original) !== token) {
        issues.push(`Mismatched reverse mapping for token: ${token.substring(0, 20)}...`);
      }
    }
    const originalCounts = new Map<string, number>();
    for (const entry of this.entries.values()) {
      originalCounts.set(entry.original, (originalCounts.get(entry.original) || 0) + 1);
    }
    for (const [, count] of originalCounts) {
      if (count > 1) issues.push("Duplicate original value stored with multiple tokens");
    }
    return { valid: issues.length === 0, issues };
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run a callback with a scoped PIIVault that is automatically cleared
 * when the callback finishes (or throws).
 */
export async function withPIIVault<T>(callback: (vault: PIIVault) => Promise<T>): Promise<T> {
  const vault = new PIIVault();
  try {
    return await callback(vault);
  } finally {
    vault.clear();
  }
}

/**
 * One-shot scrub: create a vault, scrub the string, and return both
 * the scrubbed text and the vault (so you can restore later).
 */
export function scrubWithVault(data: string): { scrubbed: string; vault: PIIVault } {
  const vault = new PIIVault();
  const scrubbed = vault.scrubString(data);
  return { scrubbed, vault };
}

/**
 * Scrub messages array in-place for AI usage log storage.
 * Returns a deep copy of the messages with PII replaced by
 * non-reversible `[Redacted]` placeholders so that raw PII is
 * never persisted to the database.
 */
export function scrubMessagesForLog(
  messages: Array<{ role: string; content: any }>,
): Array<{ role: string; content: any }> {
  const vault = new PIIVault();
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      const scrubbed = vault.scrubString(msg.content);
      return { ...msg, content: vault.toPlaceholdersString(scrubbed) };
    }
    // Handle multi-part content (e.g. vision messages with image_url)
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part: any) => {
          if (part.type === "text" && typeof part.text === "string") {
            const scrubbed = vault.scrubString(part.text);
            return { ...part, text: vault.toPlaceholdersString(scrubbed) };
          }
          // Strip base64 image data from logs
          if (part.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
            return { ...part, image_url: { url: "[base64_image_redacted]", detail: part.image_url.detail } };
          }
          return part;
        }),
      };
    }
    return msg;
  });
}

const HIGH_RISK_PII_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: "NHS_NUM", regex: PII_PATTERNS.nhsNumber },
  { key: "NI_NUM", regex: PII_PATTERNS.niNumber },
  { key: "POSTCODE", regex: PII_PATTERNS.ukPostcode },
  { key: "EMAIL", regex: PII_PATTERNS.email },
  { key: "PHONE", regex: PII_PATTERNS.ukPhone },
  { key: "PHONE", regex: PII_PATTERNS.intlPhone },
  { key: "NETWORK", regex: PII_PATTERNS.ipAddress },
  { key: "NETWORK", regex: PII_PATTERNS.ipv6Address },
  { key: "NETWORK", regex: PII_PATTERNS.macAddress },
  { key: "BANK", regex: PII_PATTERNS.ukSortCode },
  { key: "BANK", regex: PII_PATTERNS.ukBankAccount },
  { key: "CARD", regex: PII_PATTERNS.cardNumber },
  { key: "BANK", regex: PII_PATTERNS.iban },
  { key: "LICENSE", regex: PII_PATTERNS.ukDrivingLicense },
  { key: "PASSPORT", regex: PII_PATTERNS.ukPassport },
  { key: "VEHICLE", regex: PII_PATTERNS.ukVehicleReg },
  { key: "ADDRESS", regex: PII_PATTERNS.streetAddress },
  { key: "ADDRESS", regex: PII_PATTERNS.houseName },
];

export function detectHighRiskPII(
  text: string,
): { total: number; byCategory: Record<string, number> } {
  const cleaned = text.replace(/\{\{PII_[A-Z_]+_\d+\}\}/g, "");
  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const pattern of HIGH_RISK_PII_PATTERNS) {
    const matches = cleaned.match(pattern.regex);
    if (!matches || matches.length === 0) continue;
    byCategory[pattern.key] = (byCategory[pattern.key] || 0) + matches.length;
    total += matches.length;
  }

  return { total, byCategory };
}
