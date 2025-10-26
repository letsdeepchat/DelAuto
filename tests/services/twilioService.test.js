// TWILIO SERVICE INTEGRATION TESTS - With Mocks
require('dotenv').config({ path: '.env.test' });
const sinon = require('sinon');

describe('Twilio Service - Integration Tests', () => {
  const originalEnv = process.env;
  let twilioStub;

  beforeEach(() => {
    jest.resetModules();
    // Mock Twilio to avoid real API calls
    twilioStub = sinon.stub().returns({
      calls: {
        create: sinon.stub().resolves({
          sid: 'CA123456789',
          status: 'queued'
        })
      }
    });
    // Replace the twilio module
    require.cache[require.resolve('twilio')] = {
      exports: twilioStub
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    sinon.restore();
    // Clear require cache
    delete require.cache[require.resolve('twilio')];
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

      const result = await twilioService.makeCustomerCall(testDelivery);
      // Should succeed with mocked Twilio
      expect(result.sid).toBe('CA123456789');
      expect(result.status).toBe('queued');
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

      // Mock Twilio to throw error for invalid phone
      twilioStub.returns({
        calls: {
          create: sinon.stub().rejects(new Error('Invalid phone number'))
        }
      });

      const twilioService = require('../../src/services/twilioService');

      const invalidDelivery = { ...testDelivery, customer_phone: 'invalid' };

      await expect(twilioService.makeCustomerCall(invalidDelivery)).rejects.toThrow('Invalid phone number');
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

      // Mock Twilio to throw service error
      twilioStub.returns({
        calls: {
          create: sinon.stub().rejects(new Error('Twilio service unavailable'))
        }
      });

      const twilioService = require('../../src/services/twilioService');

      await expect(twilioService.makeCustomerCall(testDelivery)).rejects.toThrow('Twilio service unavailable');
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
      expect(twilioService.twilioClient).toBeDefined();
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
      // Should define client when configured
      expect(twilioService.twilioClient).toBeDefined();
    });

    it('should handle missing configuration gracefully', () => {
      process.env = { ...originalEnv };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      const twilioService = require('../../src/services/twilioService');
      expect(twilioService.twilioClient).toBe(null);
    });

    it('should handle makeCustomerCall when Twilio configured', async () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      const twilioService = require('../../src/services/twilioService');

      const result = await twilioService.makeCustomerCall(testDelivery);
      expect(result.sid).toBe('CA123456789');
      expect(result.status).toBe('queued');
    });

    it('should handle invalid phone number gracefully', async () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      twilioStub.returns({
        calls: {
          create: sinon.stub().rejects(new Error('Invalid phone number'))
        }
      });

      const twilioService = require('../../src/services/twilioService');

      const invalidDelivery = { ...testDelivery, customer_phone: 'invalid' };

      await expect(twilioService.makeCustomerCall(invalidDelivery)).rejects.toThrow('Invalid phone number');
    });

    it('should handle service errors gracefully', async () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      twilioStub.returns({
        calls: {
          create: sinon.stub().rejects(new Error('Twilio service unavailable'))
        }
      });

      const twilioService = require('../../src/services/twilioService');

      await expect(twilioService.makeCustomerCall(testDelivery)).rejects.toThrow('Twilio service unavailable');
    });

    it('should validate service configuration', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://api.example.com'
      };

      const twilioService = require('../../src/services/twilioService');

      expect(typeof twilioService.makeCustomerCall).toBe('function');
      expect(twilioService.twilioClient).toBeDefined();
    });

    it('should handle twilioClient configuration', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'test_sid',
        TWILIO_AUTH_TOKEN: 'test_token'
      };

      const twilioService = require('../../src/services/twilioService');
      expect(twilioService.twilioClient).toBeDefined();
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