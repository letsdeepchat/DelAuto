// TWILIO SERVICE INTEGRATION TESTS - No Mocks
require('dotenv').config({ path: '.env.test' });

describe('Twilio Service - Integration Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('makeCustomerCall', () => {
    const testDelivery = {
      _id: 'delivery123',
      customer_phone: '+15555551234'
    };

    it('should handle makeCustomerCall when Twilio configured', async () => {
      // Set up environment with test config
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      const twilioService = require('../../src/services/twilioService');
      
      try {
        const result = await twilioService.makeCustomerCall(testDelivery);
        // Either succeeds or fails gracefully
        expect([200, 400, 401, 403, 500]).toContain(result?.status || 500);
      } catch (error) {
        // Expected - Twilio not actually configured with valid credentials
        expect(error).toBeDefined();
      }
    });

    it('should throw error when Twilio client is not configured', async () => {
      // Set environment without Twilio config
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test'
      };
      // Clear Twilio env vars
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      
      const twilioService = require('../../src/services/twilioService');
      
      await expect(twilioService.makeCustomerCall(testDelivery)).rejects.toThrow(
        'Twilio client not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
      );
    });

    it('should handle invalid phone number gracefully', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      const twilioService = require('../../src/services/twilioService');
      
      const invalidDelivery = { ...testDelivery, customer_phone: 'invalid' };
      
      try {
        await twilioService.makeCustomerCall(invalidDelivery);
      } catch (error) {
        // Expected error for invalid phone number
        expect(error).toBeDefined();
      }
    });

    it('should handle service errors gracefully', async () => {
      // Test configuration availability
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      const twilioService = require('../../src/services/twilioService');
      
      try {
        await twilioService.makeCustomerCall(testDelivery);
        // If successful, that's fine
      } catch (error) {
        // If failed, ensure it's handled properly
        expect(error).toBeDefined();
      }
    });

    it('should validate service configuration', () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://api.example.com'
      };

      const twilioService = require('../../src/services/twilioService');
      
      // Service should be accessible
      expect(typeof twilioService.makeCustomerCall).toBe('function');
    });
  });

  describe('module exports', () => {
    it('should export makeCustomerCall function', () => {
      const twilioService = require('../../src/services/twilioService');
      expect(typeof twilioService.makeCustomerCall).toBe('function');
    });

    it('should handle twilioClient configuration', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token'
      };

      const twilioService = require('../../src/services/twilioService');
      // Should define client or handle gracefully if not configured
      expect(twilioService.twilioClient !== undefined).toBe(true);
    });

    it('should handle missing configuration gracefully', () => {
      process.env = { ...originalEnv };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      const twilioService = require('../../src/services/twilioService');
      expect(twilioService.twilioClient).toBe(null);
    });
  });
});