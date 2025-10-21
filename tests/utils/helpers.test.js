// WORKING HELPERS TESTS - Based on actual implementation
const helpers = require('../../src/utils/helpers');

describe('Utility Helpers', () => {
  describe('formatPhoneNumber', () => {
    it('should format US phone numbers correctly', () => {
      expect(helpers.formatPhoneNumber('1234567890')).toBe('+11234567890');
      expect(helpers.formatPhoneNumber('(123) 456-7890')).toBe('+11234567890');
      expect(helpers.formatPhoneNumber('123-456-7890')).toBe('+11234567890');
      expect(helpers.formatPhoneNumber('123.456.7890')).toBe('+11234567890');
    });

    it('should handle US numbers with country code', () => {
      expect(helpers.formatPhoneNumber('11234567890')).toBe('+11234567890');
      expect(helpers.formatPhoneNumber('1-123-456-7890')).toBe('+11234567890');
    });

    it('should handle international phone numbers', () => {
      expect(helpers.formatPhoneNumber('447700123456')).toBe('+447700123456');
      expect(helpers.formatPhoneNumber('33123456789')).toBe('+33123456789');
      expect(helpers.formatPhoneNumber('521234567890')).toBe('+521234567890');
    });

    it('should handle invalid phone numbers', () => {
      expect(helpers.formatPhoneNumber('invalid')).toBeNull();
      expect(helpers.formatPhoneNumber('123')).toBeNull();
      expect(helpers.formatPhoneNumber('')).toBeNull();
      expect(helpers.formatPhoneNumber(null)).toBeNull();
      expect(helpers.formatPhoneNumber(undefined)).toBeNull();
    });

    it('should validate phone number lengths', () => {
      expect(helpers.formatPhoneNumber('12345')).toBeNull(); // Too short
      expect(helpers.formatPhoneNumber('1234567890123456')).toBeNull(); // Too long
      expect(helpers.formatPhoneNumber('1234567890')).toBe('+11234567890'); // Valid length
    });

    it('should handle non-string input', () => {
      expect(helpers.formatPhoneNumber(1234567890)).toBeNull();
      expect(helpers.formatPhoneNumber({})).toBeNull();
      expect(helpers.formatPhoneNumber([])).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(helpers.validateEmail('test@example.com')).toBe(true);
      expect(helpers.validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(helpers.validateEmail('user123@subdomain.domain.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(helpers.validateEmail('invalid-email')).toBe(false);
      expect(helpers.validateEmail('test@')).toBe(false);
      expect(helpers.validateEmail('@domain.com')).toBe(false);
      expect(helpers.validateEmail('test@domain')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(helpers.validateEmail('')).toBe(false);
      expect(helpers.validateEmail(null)).toBe(false);
      expect(helpers.validateEmail(undefined)).toBe(false);
      expect(helpers.validateEmail(' test@example.com ')).toBe(false); // No trimming
    });

    it('should reject emails with spaces', () => {
      expect(helpers.validateEmail('test user@example.com')).toBe(false);
      expect(helpers.validateEmail('test@ex ample.com')).toBe(false);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = helpers.generateId();
      const id2 = helpers.generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1.length).toBeGreaterThan(5);
    });

    it('should generate IDs with prefix', () => {
      const id = helpers.generateId('test');
      
      expect(id).toMatch(/^test_/);
      expect(id.split('_').length).toBe(3);
    });

    it('should generate IDs without prefix', () => {
      const id = helpers.generateId();
      
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
      expect(id.split('_').length).toBe(2);
    });

    it('should handle empty prefix', () => {
      const id = helpers.generateId('');
      
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
      expect(id.split('_').length).toBe(2);
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(helpers.sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(helpers.sanitizeString('Hello <b>World</b>')).toBe('Hello bWorld/b');
    });

    it('should trim whitespace', () => {
      expect(helpers.sanitizeString('  hello world  ')).toBe('hello world');
      expect(helpers.sanitizeString('\ttest\n')).toBe('test');
    });

    it('should handle edge cases', () => {
      expect(helpers.sanitizeString('')).toBe('');
      expect(helpers.sanitizeString(null)).toBe('');
      expect(helpers.sanitizeString(undefined)).toBe('');
      expect(helpers.sanitizeString(123)).toBe('');
    });

    it('should preserve safe characters', () => {
      expect(helpers.sanitizeString('Hello World! @#$%^&*()')).toBe('Hello World! @#$%^&*()');
      expect(helpers.sanitizeString('user@example.com')).toBe('user@example.com');
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation!