/**
 * Client-side PII Vault Utilities
 * 
 * Used to restore PII values from server-provided vault mappings.
 * Only used for authorized admin users with sensitive view enabled.
 * 
 * Flow:
 * 1. Client sends document for analysis
 * 2. Server scrubs PII, sends scrubbed data to AI
 * 3. AI returns results with tokens (e.g., {{PII_xyz_NAME_1}})
 * 4. Server converts to placeholders (e.g., [Name]) for standard users
 * 5. For authorized admins with allowSensitive=true:
 *    - Server also exports vault mapping
 *    - Client uses this module to restore original values locally
 * 
 * Security:
 * - PII data never leaves the client-server boundary
 * - AI only sees scrubbed data with tokens
 * - Original PII is restored locally on the client, never transmitted back
 */

export type PIICategory = 
  | 'NHS_NUM' | 'NI_NUM' | 'POSTCODE' | 'EMAIL' | 'PHONE'
  | 'DATE' | 'DOB' | 'AGE' | 'ADDRESS' | 'NAME' | 'STAFF'
  | 'HEALTHCARE_PRO' | 'CONTACT' | 'FIELD'
  | 'BANK' | 'CARD' | 'LICENSE' | 'PASSPORT' | 'VEHICLE' | 'NETWORK';

export interface VaultExport {
  prefix: string;
  mapping: Record<string, { original: string; category: PIICategory }>;
}

/**
 * Placeholder text for each PII category (matches server-side toPlaceholders)
 */
const CATEGORY_PLACEHOLDERS: Record<PIICategory, string> = {
  NHS_NUM: '[NHS Number]',
  NI_NUM: '[NI Number]',
  POSTCODE: '[Postcode]',
  EMAIL: '[Email]',
  PHONE: '[Phone]',
  DATE: '[Date]',
  DOB: '[Date of Birth]',
  AGE: '[Age]',
  ADDRESS: '[Address]',
  NAME: '[Name]',
  STAFF: '[Staff Member]',
  HEALTHCARE_PRO: '[Healthcare Professional]',
  CONTACT: '[Contact Number]',
  FIELD: '[Personal Field]',
  BANK: '[Bank Details]',
  CARD: '[Card Number]',
  LICENSE: '[Driving License]',
  PASSPORT: '[Passport Number]',
  VEHICLE: '[Vehicle Registration]',
  NETWORK: '[Network ID]',
};

/**
 * Client-side PII Vault for restoring sensitive data locally
 * 
 * Usage:
 *   const vault = new ClientPIIVault(vaultExport);
 *   const restored = vault.restore(scrubbedResult);
 */
export class ClientPIIVault {
  private mapping: Record<string, { original: string; category: PIICategory }>;
  private prefix: string;

  constructor(vaultExport: VaultExport) {
    this.prefix = vaultExport.prefix;
    this.mapping = vaultExport.mapping;
  }
  
  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get the original value for a token
   */
  get(token: string): string | undefined {
    return this.mapping[token]?.original;
  }

  /**
   * Get the category for a token
   */
  getCategory(token: string): PIICategory | undefined {
    return this.mapping[token]?.category;
  }

  /**
   * Check if a string is a vault token
   */
  isToken(str: string): boolean {
    const escapedPrefix = this.escapeRegex(this.prefix);
    const pattern = new RegExp(`^\\{\\{${escapedPrefix}_[A-Z_]+_\\d+\\}\\}$`);
    return pattern.test(str);
  }

  /**
   * Get statistics about stored PII
   */
  getStats(): { total: number; byCategory: Partial<Record<PIICategory, number>> } {
    const byCategory: Partial<Record<PIICategory, number>> = {};
    
    for (const entry of Object.values(this.mapping)) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }
    
    return { total: Object.keys(this.mapping).length, byCategory };
  }

  /**
   * Restore tokens in a string back to original values
   * Handles edge cases: null, undefined, empty strings, and missing tokens
   */
  restoreString(data: string): string {
    if (data === null || data === undefined) return '';
    if (typeof data !== 'string') return String(data);
    if (!data.trim()) return data;
    
    let restored = data;
    
    // Find all tokens matching this vault's prefix and replace with originals
    try {
      const escapedPrefix = this.escapeRegex(this.prefix);
      const tokenPattern = new RegExp(`\\{\\{${escapedPrefix}_[A-Z_]+_\\d+\\}\\}`, 'g');
      restored = restored.replace(tokenPattern, (token) => {
        const original = this.get(token);
        return original !== undefined ? original : token;
      });
    } catch (e) {
      console.error('[ClientPIIVault] Error restoring string:', e);
      return data;
    }
    
    return restored;
  }

  /**
   * Restore any data type (string, array, object) back to original values
   * Handles nested structures and preserves non-string primitives
   */
  restore<T = any>(data: T): T {
    if (data === null || data === undefined) return data;
    
    if (typeof data === "string") {
      return this.restoreString(data) as unknown as T;
    }
    
    if (Array.isArray(data)) {
      return data.map((item) => this.restore(item)) as unknown as T;
    }
    
    if (typeof data === "object") {
      try {
        const restored: Record<string, any> = {};
        for (const key of Object.keys(data)) {
          restored[key] = this.restore((data as Record<string, any>)[key]);
        }
        return restored as T;
      } catch (e) {
        console.error('[ClientPIIVault] Error restoring object:', e);
        return data;
      }
    }
    
    // Preserve numbers, booleans, etc.
    return data;
  }

  /**
   * Convert tokens to human-readable placeholders (not original values)
   * Use this for non-sensitive view mode
   */
  toPlaceholdersString(data: string): string {
    if (!data) return data;
    
    const escapedPrefix = this.escapeRegex(this.prefix);
    const tokenPattern = new RegExp(`\\{\\{${escapedPrefix}_([A-Z_]+)_\\d+\\}\\}`, 'g');
    return data.replace(tokenPattern, (_token, category) => {
      return CATEGORY_PLACEHOLDERS[category as PIICategory] || '[Redacted]';
    });
  }

  /**
   * Convert any data type to placeholder format
   */
  toPlaceholders(data: any): any {
    if (typeof data === "string") {
      return this.toPlaceholdersString(data);
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.toPlaceholders(item));
    }
    if (typeof data === "object" && data !== null) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(data)) {
        result[key] = this.toPlaceholders(data[key]);
      }
      return result;
    }
    return data;
  }

  /**
   * Get all tokens in the vault
   */
  getAllTokens(): string[] {
    return Object.keys(this.mapping);
  }

  /**
   * Check if vault has any entries
   */
  isEmpty(): boolean {
    return Object.keys(this.mapping).length === 0;
  }
}

/**
 * Helper to check if data contains PII tokens
 */
export function containsPIITokens(data: any): boolean {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return /\{\{PII_[a-z0-9]+_[A-Z_]+_\d+\}\}/i.test(str);
}

/**
 * Helper to check if data contains placeholder text
 */
export function containsPlaceholders(data: any): boolean {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return /\[(Name|NHS Number|NI Number|Postcode|Email|Phone|Date|Date of Birth|Age|Address|Staff Member|Healthcare Professional|Contact Number|Personal Field|Bank Details|Card Number|Driving License|Passport Number|Vehicle Registration|Network ID|Redacted)\]/i.test(str);
}

/**
 * Create a vault from server response
 * Returns null if no vault data in response
 * Validates the vault structure before creating
 */
export function createVaultFromResponse(responseData: any): ClientPIIVault | null {
  try {
    if (!responseData) return null;
    
    const vaultExport = responseData.vaultExport;
    if (!vaultExport || typeof vaultExport !== 'object') return null;
    if (typeof vaultExport.prefix !== 'string' || !vaultExport.prefix) return null;
    if (!vaultExport.mapping || typeof vaultExport.mapping !== 'object') return null;
    
    // Validate mapping structure
    const mappingKeys = Object.keys(vaultExport.mapping);
    if (mappingKeys.length === 0) return null;
    
    // Check first entry has expected shape
    const firstEntry = vaultExport.mapping[mappingKeys[0]];
    if (!firstEntry || typeof firstEntry.original !== 'string' || typeof firstEntry.category !== 'string') {
      console.warn('[createVaultFromResponse] Invalid mapping entry structure');
      return null;
    }
    
    return new ClientPIIVault(vaultExport);
  } catch (e) {
    console.error('[createVaultFromResponse] Error creating vault:', e);
    return null;
  }
}

/**
 * Restore PII in analysis result using vault export
 * Falls back to original data if no vault provided
 */
export function restoreWithVault<T>(data: T, vaultExport: VaultExport | undefined | null): T {
  if (!vaultExport?.prefix || !vaultExport?.mapping) {
    return data;
  }
  try {
    const vault = new ClientPIIVault(vaultExport);
    return vault.restore(data) as T;
  } catch (e) {
    console.error('[restoreWithVault] Error restoring data:', e);
    return data;
  }
}

/**
 * Extract vault export and rawWithTokens from server response
 * Usage: const { result, vault, rawWithTokens } = extractVaultFromResponse(data);
 */
export function extractVaultFromResponse<T = any>(responseData: any): {
  result: T;
  vault: ClientPIIVault | null;
  rawWithTokens: T | null;
  hasVault: boolean;
} {
  if (!responseData || typeof responseData !== 'object') {
    return { result: responseData, vault: null, rawWithTokens: null, hasVault: false };
  }
  
  const vault = createVaultFromResponse(responseData);
  const rawWithTokens = responseData.rawWithTokens ?? null;
  
  // Remove vault-specific fields from the result
  const { vaultExport: _ve, rawWithTokens: _rwt, ...cleanResult } = responseData;
  
  return {
    result: cleanResult as T,
    vault,
    rawWithTokens: rawWithTokens as T | null,
    hasVault: vault !== null && rawWithTokens !== null,
  };
}

/**
 * Process server response with automatic vault restoration for admin users
 * Returns restored data if vault available, otherwise returns template data
 */
export function processVaultResponse<T = any>(responseData: any, allowSensitive: boolean): {
  scrubbed: T;
  raw: T | null;
} {
  const { result, vault, rawWithTokens, hasVault } = extractVaultFromResponse<T>(responseData);
  
  if (allowSensitive && hasVault && vault && rawWithTokens) {
    // Restore PII locally using vault
    const restored = vault.restore(rawWithTokens);
    return {
      scrubbed: result,
      raw: restored as T,
    };
  }
  
  return {
    scrubbed: result,
    raw: null,
  };
}
