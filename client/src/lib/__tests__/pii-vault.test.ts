/**
 * Tests for Client-side PII Vault Utilities
 * 
 * Verifies that the vault correctly restores PII tokens back to original values
 * using the vault export provided by the server.
 */
// @ts-expect-error - vitest types are provided by vitest runner at test time
import { describe, it, expect } from 'vitest';
import { 
  ClientPIIVault, 
  VaultExport, 
  restoreWithVault, 
  createVaultFromResponse,
  extractVaultFromResponse,
  processVaultResponse
} from '../pii-vault';

describe('ClientPIIVault', () => {
  const mockVaultExport: VaultExport = {
    prefix: 'PII_abc123',
    mapping: {
      '{{PII_abc123_NAME_1}}': { original: 'John Smith', category: 'NAME' },
      '{{PII_abc123_NHS_1}}': { original: '123 456 7890', category: 'NHS_NUM' },
      '{{PII_abc123_DOB_1}}': { original: '15/03/1985', category: 'DOB' },
      '{{PII_abc123_EMAIL_1}}': { original: 'john@example.com', category: 'EMAIL' },
    }
  };

  describe('constructor and get', () => {
    it('should create vault from export and retrieve values', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      expect(vault.get('{{PII_abc123_NAME_1}}')).toBe('John Smith');
      expect(vault.get('{{PII_abc123_NHS_1}}')).toBe('123 456 7890');
    });

    it('should return undefined for unknown tokens', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      expect(vault.get('{{PII_abc123_UNKNOWN_1}}')).toBeUndefined();
      expect(vault.get('{{PII_other_NAME_1}}')).toBeUndefined();
    });
  });

  describe('restoreString', () => {
    it('should restore tokens in a string', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const input = 'Patient {{PII_abc123_NAME_1}} has NHS number {{PII_abc123_NHS_1}}';
      const expected = 'Patient John Smith has NHS number 123 456 7890';
      expect(vault.restoreString(input)).toBe(expected);
    });

    it('should leave unrecognized tokens unchanged', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const input = 'Patient {{PII_abc123_NAME_1}} of age {{PII_other_AGE_1}}';
      const expected = 'Patient John Smith of age {{PII_other_AGE_1}}';
      expect(vault.restoreString(input)).toBe(expected);
    });

    it('should handle empty strings', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      expect(vault.restoreString('')).toBe('');
      expect(vault.restoreString('   ')).toBe('   ');
    });

    it('should handle null/undefined gracefully', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      expect(vault.restoreString(null as any)).toBe('');
      expect(vault.restoreString(undefined as any)).toBe('');
    });

    it('should handle non-string input', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      expect(vault.restoreString(123 as any)).toBe('123');
    });
  });

  describe('restore (any data type)', () => {
    it('should restore tokens in nested objects', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const input = {
        name: '{{PII_abc123_NAME_1}}',
        details: {
          nhsNumber: '{{PII_abc123_NHS_1}}',
          dob: '{{PII_abc123_DOB_1}}'
        }
      };
      const expected = {
        name: 'John Smith',
        details: {
          nhsNumber: '123 456 7890',
          dob: '15/03/1985'
        }
      };
      expect(vault.restore(input)).toEqual(expected);
    });

    it('should restore tokens in arrays', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const input = ['{{PII_abc123_NAME_1}}', '{{PII_abc123_EMAIL_1}}', 'static'];
      const expected = ['John Smith', 'john@example.com', 'static'];
      expect(vault.restore(input)).toEqual(expected);
    });

    it('should preserve non-string primitives', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const input = {
        name: '{{PII_abc123_NAME_1}}',
        age: 42,
        active: true,
        nullable: null,
        score: 3.14
      };
      const result = vault.restore(input);
      expect(result.name).toBe('John Smith');
      expect(result.age).toBe(42);
      expect(result.active).toBe(true);
      expect(result.nullable).toBeNull();
      expect(result.score).toBe(3.14);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const vault = new ClientPIIVault(mockVaultExport);
      const stats = vault.getStats();
      expect(stats.total).toBe(4);
      expect(stats.byCategory.NAME).toBe(1);
      expect(stats.byCategory.NHS_NUM).toBe(1);
      expect(stats.byCategory.DOB).toBe(1);
      expect(stats.byCategory.EMAIL).toBe(1);
    });
  });
});

describe('restoreWithVault', () => {
  const mockVaultExport: VaultExport = {
    prefix: 'PII_test',
    mapping: {
      '{{PII_test_NAME_1}}': { original: 'Jane Doe', category: 'NAME' },
    }
  };

  it('should restore data with valid vault', () => {
    const data = { name: '{{PII_test_NAME_1}}' };
    const result = restoreWithVault(data, mockVaultExport);
    expect(result.name).toBe('Jane Doe');
  });

  it('should return original data when vault is null', () => {
    const data = { name: '{{PII_test_NAME_1}}' };
    const result = restoreWithVault(data, null);
    expect(result.name).toBe('{{PII_test_NAME_1}}');
  });

  it('should return original data when vault is invalid', () => {
    const data = { name: '{{PII_test_NAME_1}}' };
    const result = restoreWithVault(data, { prefix: '', mapping: {} });
    expect(result.name).toBe('{{PII_test_NAME_1}}');
  });
});

describe('createVaultFromResponse', () => {
  it('should create vault from valid response', () => {
    const response = {
      vaultExport: {
        prefix: 'PII_valid',
        mapping: {
          '{{PII_valid_NAME_1}}': { original: 'Test', category: 'NAME' as const }
        }
      }
    };
    const vault = createVaultFromResponse(response);
    expect(vault).not.toBeNull();
    expect(vault?.get('{{PII_valid_NAME_1}}')).toBe('Test');
  });

  it('should return null for missing vaultExport', () => {
    expect(createVaultFromResponse({})).toBeNull();
    expect(createVaultFromResponse(null)).toBeNull();
    expect(createVaultFromResponse(undefined)).toBeNull();
  });

  it('should return null for invalid mapping structure', () => {
    expect(createVaultFromResponse({ vaultExport: { prefix: 'x', mapping: {} } })).toBeNull();
    expect(createVaultFromResponse({ 
      vaultExport: { 
        prefix: 'x', 
        mapping: { '{{PII_x_NAME_1}}': 'not valid structure' } 
      } 
    })).toBeNull();
  });
});

describe('extractVaultFromResponse', () => {
  it('should extract vault and raw data from response', () => {
    const response = {
      content: 'Template with [Name]',
      vaultExport: {
        prefix: 'PII_extract',
        mapping: {
          '{{PII_extract_NAME_1}}': { original: 'Bob', category: 'NAME', createdAt: Date.now() }
        }
      },
      rawWithTokens: { content: 'Template with {{PII_extract_NAME_1}}' }
    };

    const { result, vault, rawWithTokens, hasVault } = extractVaultFromResponse(response);
    
    expect(hasVault).toBe(true);
    expect(vault).not.toBeNull();
    expect(rawWithTokens).toEqual({ content: 'Template with {{PII_extract_NAME_1}}' });
    expect(result.content).toBe('Template with [Name]');
    expect(result.vaultExport).toBeUndefined();
    expect(result.rawWithTokens).toBeUndefined();
  });

  it('should handle response without vault', () => {
    const response = { content: 'Plain content' };
    const { result, vault, rawWithTokens, hasVault } = extractVaultFromResponse(response);
    
    expect(hasVault).toBe(false);
    expect(vault).toBeNull();
    expect(rawWithTokens).toBeNull();
    expect(result.content).toBe('Plain content');
  });
});

describe('processVaultResponse', () => {
  const mockVaultExport: VaultExport = {
    prefix: 'PII_proc',
    mapping: {
      '{{PII_proc_NAME_1}}': { original: 'Alice', category: 'NAME' }
    }
  };

  it('should restore PII for admin with allowSensitive', () => {
    const response = {
      content: 'Hello [Name]',
      vaultExport: mockVaultExport,
      rawWithTokens: { content: 'Hello {{PII_proc_NAME_1}}' }
    };

    const { scrubbed, raw } = processVaultResponse(response, true);
    
    expect(scrubbed.content).toBe('Hello [Name]');
    expect(raw?.content).toBe('Hello Alice');
  });

  it('should not restore PII when allowSensitive is false', () => {
    const response = {
      content: 'Hello [Name]',
      vaultExport: mockVaultExport,
      rawWithTokens: { content: 'Hello {{PII_proc_NAME_1}}' }
    };

    const { scrubbed, raw } = processVaultResponse(response, false);
    
    expect(scrubbed.content).toBe('Hello [Name]');
    expect(raw).toBeNull();
  });

  it('should handle response without vault data', () => {
    const response = { content: 'No PII here' };
    const { scrubbed, raw } = processVaultResponse(response, true);
    
    expect(scrubbed.content).toBe('No PII here');
    expect(raw).toBeNull();
  });
});
