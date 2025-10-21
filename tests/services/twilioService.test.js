// WORKING TWILIO SERVICE TESTS - Based on actual implementation
const CallLog = require('../../src/database/models/CallLog');

// Mock external dependencies
jest.mock('twilio');
jest.mock('../../src/database/models/CallLog');

const twilio = require('twilio');

describe('Twilio Service', () => {
  const originalEnv = process.env;
  let mockTwilioClient;
  let mockCallLog;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Mock Twilio client
    mockTwilioClient = {
      calls: {
        create: jest.fn()
      }
    };
    twilio.mockReturnValue(mockTwilioClient);
    
    // Mock CallLog
    mockCallLog = {
      save: jest.fn().mockResolvedValue(true)
    };
    CallLog.mockImplementation(() => mockCallLog);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('makeCustomerCall', () => {
    const mockDelivery = {
      _id: 'delivery123',
      customer_phone: '+15555551234'
    };

    const mockCallResponse = {
      sid: 'CA1234567890abcdef1234567890abcdef',
      status: 'queued'
    };

    it('should make a customer call successfully when configured', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      mockTwilioClient.calls.create.mockResolvedValue(mockCallResponse);

      const twilioService = require('../../src/services/twilioService');
      const result = await twilioService.makeCustomerCall(mockDelivery);

      expect(twilio).toHaveBeenCalledWith('ACtest123', 'test_token');
      expect(mockTwilioClient.calls.create).toHaveBeenCalledWith({
        url: 'https://example.com/api/webhooks/voice?delivery_id=delivery123',
        to: '+15555551234',
        from: '+15555559999',
        statusCallback: 'https://example.com/api/webhooks/call-status',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });
      expect(CallLog).toHaveBeenCalledWith({
        delivery_id: 'delivery123',
        call_sid: 'CA1234567890abcdef1234567890abcdef',
        status: 'queued'
      });
      expect(mockCallLog.save).toHaveBeenCalled();
      expect(result).toEqual(mockCallResponse);
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
      
      await expect(twilioService.makeCustomerCall(mockDelivery)).rejects.toThrow(
        'Twilio client not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
      );
    });

    it('should handle Twilio API errors', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      const twilioError = new Error('Invalid phone number');
      mockTwilioClient.calls.create.mockRejectedValue(twilioError);

      const twilioService = require('../../src/services/twilioService');

      await expect(twilioService.makeCustomerCall(mockDelivery)).rejects.toThrow('Invalid phone number');
      expect(CallLog).not.toHaveBeenCalled();
    });

    it('should handle call log save failure', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      mockTwilioClient.calls.create.mockResolvedValue(mockCallResponse);
      mockCallLog.save.mockRejectedValue(new Error('Database error'));

      const twilioService = require('../../src/services/twilioService');

      await expect(twilioService.makeCustomerCall(mockDelivery)).rejects.toThrow('Database error');
      expect(mockTwilioClient.calls.create).toHaveBeenCalled();
    });

    it('should include delivery ID in webhook URL', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://api.example.com'
      };

      mockTwilioClient.calls.create.mockResolvedValue(mockCallResponse);

      const customDelivery = { ...mockDelivery, _id: 'special_delivery_456' };
      const twilioService = require('../../src/services/twilioService');
      
      await twilioService.makeCustomerCall(customDelivery);

      expect(mockTwilioClient.calls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/api/webhooks/voice?delivery_id=special_delivery_456'
        })
      );
    });

    it('should use correct status callback events', async () => {
      // Set up environment
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token',
        TWILIO_PHONE_NUMBER: '+15555559999',
        BASE_URL: 'https://example.com'
      };

      mockTwilioClient.calls.create.mockResolvedValue(mockCallResponse);

      const twilioService = require('../../src/services/twilioService');
      await twilioService.makeCustomerCall(mockDelivery);

      expect(mockTwilioClient.calls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        })
      );
    });
  });

  describe('module exports', () => {
    it('should export makeCustomerCall function', () => {
      const twilioService = require('../../src/services/twilioService');
      expect(typeof twilioService.makeCustomerCall).toBe('function');
    });

    it('should export twilioClient when configured', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest123',
        TWILIO_AUTH_TOKEN: 'test_token'
      };

      const twilioService = require('../../src/services/twilioService');
      expect(twilioService.twilioClient).toBeDefined();
    });

    it('should export null twilioClient when not configured', () => {
      process.env = { ...originalEnv };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      const twilioService = require('../../src/services/twilioService');
      expect(twilioService.twilioClient).toBe(null);
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation!