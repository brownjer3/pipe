import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService, EncryptedData } from './encryption';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  const testData = 'This is sensitive data';

  beforeEach(() => {
    // Set the environment variable for the test
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    encryptionService = new EncryptionService();
  });

  describe('constructor', () => {
    it('should create an instance with valid key', () => {
      expect(encryptionService).toBeDefined();
      expect(encryptionService).toBeInstanceOf(EncryptionService);
    });

    it('should throw error without ENCRYPTION_KEY env var', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => new EncryptionService()).toThrow(
        'ENCRYPTION_KEY environment variable is required'
      );

      // Restore
      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should throw error with invalid key length', () => {
      const originalKey = process.env.ENCRYPTION_KEY;

      process.env.ENCRYPTION_KEY = 'short-key';
      expect(() => new EncryptionService()).toThrow(
        'ENCRYPTION_KEY must be a 64-character hex string'
      );

      process.env.ENCRYPTION_KEY = '';
      expect(() => new EncryptionService()).toThrow(
        'ENCRYPTION_KEY environment variable is required'
      );

      // Restore
      process.env.ENCRYPTION_KEY = originalKey;
    });
  });

  describe('encrypt', () => {
    it('should encrypt a string and return EncryptedData', () => {
      const encrypted = encryptionService.encrypt(testData);

      expect(encrypted).toBeDefined();
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted.encrypted).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      // Should be base64 encoded
      expect(() => Buffer.from(encrypted.encrypted, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.authTag, 'base64')).not.toThrow();
    });

    it('should produce different ciphertexts for the same input', () => {
      const encrypted1 = encryptionService.encrypt(testData);
      const encrypted2 = encryptionService.encrypt(testData);

      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv); // Different IVs
    });

    it('should handle empty strings', () => {
      const encrypted = encryptionService.encrypt('');
      expect(encrypted).toBeDefined();

      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const specialData = '!@#$%^&*()_+-=[]{}|;:"<>,.?/~`';
      const encrypted = encryptionService.encrypt(specialData);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(specialData);
    });

    it('should handle Unicode characters', () => {
      const unicodeData = '🔐 Encryption 测试 тест';
      const encrypted = encryptionService.encrypt(unicodeData);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data', () => {
      const encrypted = encryptionService.encrypt(testData);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(testData);
    });

    it('should throw error for invalid data', () => {
      const invalidData: EncryptedData = {
        encrypted: 'invalid',
        iv: 'invalid',
        authTag: 'invalid',
      };

      expect(() => encryptionService.decrypt(invalidData)).toThrow();
    });

    it('should throw error for tampered data', () => {
      const encrypted = encryptionService.encrypt(testData);

      // Tamper with encrypted data by modifying the base64 string
      const tampered: EncryptedData = {
        ...encrypted,
        encrypted: 'invalid' + encrypted.encrypted.substring(7),
      };
      expect(() => encryptionService.decrypt(tampered)).toThrow();

      // Tamper with auth tag
      const tamperedAuth: EncryptedData = {
        ...encrypted,
        authTag: 'dGFtcGVyZWQ=', // 'tampered' in base64
      };
      expect(() => encryptionService.decrypt(tamperedAuth)).toThrow();
    });

    it('should throw error when using wrong key', () => {
      const encrypted = encryptionService.encrypt(testData);

      // Change the key
      process.env.ENCRYPTION_KEY =
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const wrongKeyService = new EncryptionService();

      expect(() => wrongKeyService.decrypt(encrypted)).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });
  });

  describe('roundtrip', () => {
    it('should handle large data', () => {
      const largeData = 'x'.repeat(10000);
      const encrypted = encryptionService.encrypt(largeData);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(largeData);
    });

    it('should handle multiple encrypt/decrypt cycles', () => {
      let data = testData;

      for (let i = 0; i < 10; i++) {
        const encrypted = encryptionService.encrypt(data);
        data = encryptionService.decrypt(encrypted);
      }

      expect(data).toBe(testData);
    });
  });

  describe('security', () => {
    it('should use different IVs for each encryption', () => {
      const encryptions = Array.from({ length: 100 }, () => encryptionService.encrypt(testData));

      const ivs = encryptions.map((e) => e.iv);
      const uniqueIvs = new Set(ivs);

      expect(uniqueIvs.size).toBe(100); // All IVs should be unique
    });

    it('should produce properly sized components', () => {
      const encrypted = encryptionService.encrypt(testData);

      // Decode from base64 to check byte sizes
      const ivBytes = Buffer.from(encrypted.iv, 'base64');
      const authTagBytes = Buffer.from(encrypted.authTag, 'base64');

      expect(ivBytes.length).toBe(16); // IV: 16 bytes for AES
      expect(authTagBytes.length).toBe(16); // Auth tag: 16 bytes for GCM
    });
  });
});
