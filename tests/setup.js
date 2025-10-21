// Test environment setup
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

console.log('Test environment configured');

// Global test timeout
jest.setTimeout(10000);

// Mock monitoring service to prevent setInterval issues during tests
jest.mock('../src/services/monitoringService', () => ({
  recordRequest: jest.fn(),
  recordError: jest.fn(),
  recordBusinessMetric: jest.fn(),
  getMetrics: jest.fn(() => ({
    startTime: Date.now(),
    requestCount: 0,
    errorCount: 0,
    systemMetrics: {},
    businessMetrics: {}
  })),
  reset: jest.fn()
}));

// Prevent any actual database connections during tests
jest.mock('mongoose', () => {
  const mockObjectId = jest.fn((id) => id);
  const mockSchema = function(definition, options) {
    this.definition = definition;
    this.options = options;
    return this;
  };
  mockSchema.Types = {
    ObjectId: mockObjectId
  };
  
  return {
    connect: jest.fn(),
    connection: {
      readyState: 1,
      on: jest.fn(),
      once: jest.fn()
    },
    Types: {
      ObjectId: mockObjectId
    },
    Schema: mockSchema,
    model: jest.fn()
  };
});