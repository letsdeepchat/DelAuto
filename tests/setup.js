// Test environment setup - NO MOCKS VERSION
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

console.log('Test environment configured');

// Global test timeout
jest.setTimeout(30000);

// Global setup for integration tests
beforeAll(() => {
  // Suppress console output during tests to reduce noise
  if (process.env.SUPPRESS_TEST_LOGS === 'true') {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Clean up any global resources if needed
});

// Global error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the test process, just log it
});

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.warn('Uncaught Exception:', error);
  // Don't exit the test process, just log it
});

// Helper function for tests to wait for async operations
global.waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if a service is available
global.isServiceAvailable = async (serviceCheck) => {
  try {
    await serviceCheck();
    return true;
  } catch (error) {
    return false;
  }
};

// Test environment configuration
global.testConfig = {
  apiKey: process.env.API_KEY || 'test_api_key_123',
  jwtSecret: process.env.JWT_SECRET || 'test-jwt-secret',
  mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/delauto_test',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest1234567890123456789012345678',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || 'test_auth_token'
};

// Mock data for testing
global.testData = {
  delivery: {
    _id: '507f1f77bcf86cd799439011',
    customer_name: 'Test Customer',
    customer_phone: '+15555551234',
    address: '123 Test Street',
    status: 'pending',
    toString: function() { return this._id; }
  },
  user: {
    _id: '507f1f77bcf86cd799439012',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin'
  },
  agent: {
    _id: '507f1f77bcf86cd799439013',
    name: 'Test Agent',
    phone: '+15555556789',
    role: 'agent'
  },
  validDelivery: {
    _id: '507f1f77bcf86cd799439011',
    customer_name: 'Test Customer',
    customer_phone: '+15555551234',
    address: '123 Test Street',
    status: 'pending',
    agent_id: '507f1f77bcf86cd799439013',
    toString: function() { return this._id; }
  },
  validAgent: {
    _id: '507f1f77bcf86cd799439013',
    name: 'Test Agent',
    email: 'agent@test.com',
    phone: '+15555556789',
    role: 'agent'
  },
  validCustomer: {
    _id: '507f1f77bcf86cd799439014',
    name: 'Test Customer',
    phone: '+15555551234',
    email: 'customer@test.com'
  },
  twilioWebhookData: {
    voice: {
      CallSid: 'CA123456789',
      From: '+15555551234',
      To: '+15555556789',
      CallStatus: 'in-progress'
    },
    recording: {
      CallSid: 'CA123456789',
      RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.wav',
      RecordingDuration: '30'
    },
    callStatus: {
      CallSid: 'CA123456789',
      CallStatus: 'completed',
      CallDuration: '45'
    }
  }
};

// Utility functions for tests
global.testUtils = {
  // Generate random test IDs
  generateTestId: () => Math.random().toString(36).substring(7),
  
  // Create mock request object
  createMockReq: (overrides = {}) => ({
    headers: {},
    body: {},
    params: {},
    query: {},
    user: null,
    agent: null,
    ...overrides
  }),
  
  // Create mock response object
  createMockRes: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      headers: {}
    };
    return res;
  },
  
  // Create mock next function
  createMockNext: () => jest.fn(),
  
  // Wait for condition to be true
  waitForCondition: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await waitFor(interval);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }
};

// Environment-specific test configuration
if (process.env.NODE_ENV === 'test') {
  // Test-specific configurations
  process.env.SUPPRESS_LOGS = 'true';
  process.env.LOG_LEVEL = 'error';
  
  // Shorter timeouts for tests
  process.env.REDIS_TIMEOUT = '1000';
  process.env.MONGODB_TIMEOUT = '2000';
  process.env.HTTP_TIMEOUT = '3000';
}

console.log('Integration test setup completed (no mocks)');