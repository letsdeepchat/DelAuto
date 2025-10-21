// Mock data and factory functions for testing

const mockData = {
  // Mock Twilio responses
  twilio: {
    callResponse: {
      sid: 'CA1234567890abcdef',
      status: 'queued',
      to: '+1234567890',
      from: '+0987654321',
      price: null,
      priceUnit: 'USD',
      dateCreated: new Date().toISOString(),
      dateUpdated: new Date().toISOString()
    },
    
    recordingResponse: {
      sid: 'RE1234567890abcdef',
      accountSid: 'AC1234567890abcdef',
      callSid: 'CA1234567890abcdef',
      status: 'completed',
      dateCreated: new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
      startTime: new Date().toISOString(),
      duration: '45',
      uri: '/2010-04-01/Accounts/AC123/Recordings/RE123.json'
    }
  },

  // Mock OpenAI responses
  openai: {
    transcriptionResponse: {
      text: 'I will be available at 3 PM. Please leave the package at the front door if I am not home.'
    },
    
    analysisResponse: {
      choices: [{
        message: {
          content: JSON.stringify({
            sentiment: 'positive',
            keywords: ['available', '3 PM', 'front door'],
            instructions_summary: 'Customer available at 3 PM, leave at front door if not home',
            priority_level: 'normal',
            availability: 'specific_time',
            special_instructions: 'Leave at front door if not home'
          })
        }
      }]
    }
  },

  // Mock Redis responses
  redis: {
    get: (key) => Promise.resolve(null),
    set: (key, value, options) => Promise.resolve('OK'),
    del: (key) => Promise.resolve(1),
    exists: (key) => Promise.resolve(0)
  },

  // Mock MongoDB responses
  mongodb: {
    insertOne: { insertedId: 'mock-id', acknowledged: true },
    updateOne: { modifiedCount: 1, acknowledged: true },
    deleteOne: { deletedCount: 1, acknowledged: true },
    findOne: null, // Will return test data
    find: [] // Will return array of test data
  },

  // Mock AWS S3 responses
  s3: {
    uploadResponse: {
      ETag: '"mock-etag"',
      Location: 'https://test-bucket.s3.amazonaws.com/recordings/test-recording.mp3',
      Key: 'recordings/test-recording.mp3',
      Bucket: 'test-bucket'
    },
    
    presignedUrlResponse: 'https://test-bucket.s3.amazonaws.com/recordings/test-recording.mp3?signature=test'
  },

  // Mock Queue responses
  queue: {
    addJobResponse: {
      id: 'job-123',
      name: 'call-customer',
      data: {},
      opts: {},
      timestamp: Date.now(),
      delay: 0,
      progress: 0
    },
    
    processJobResponse: {
      id: 'job-123',
      returnvalue: { success: true },
      finishedOn: Date.now()
    }
  },

  // Mock WebSocket events
  websocket: {
    connection: {
      id: 'socket-123',
      connected: true,
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn()
    },
    
    events: {
      newRecording: {
        type: 'new_recording',
        data: {
          delivery_id: 'delivery-123',
          recording_id: 'recording-123',
          agent_id: 'agent-123'
        }
      }
    }
  },

  // Mock Push notification responses
  webPush: {
    sendNotificationResponse: {
      statusCode: 201,
      body: '',
      headers: {}
    }
  },

  // Mock external API responses
  external: {
    geolocation: {
      lat: 40.7128,
      lng: -74.0060,
      city: 'New York',
      country: 'US',
      timezone: 'America/New_York'
    },
    
    weather: {
      temperature: 22,
      condition: 'clear',
      suitable_for_delivery: true
    }
  }
};

// Factory functions for creating mock data
mockData.createMockDelivery = (overrides = {}) => ({
  _id: 'mock-delivery-id',
  customer_id: 'mock-customer-id',
  agent_id: 'mock-agent-id',
  package_id: 'PKG123456',
  address: '123 Mock Street',
  scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
  status: 'scheduled',
  priority: 'normal',
  ...overrides
});

mockData.createMockAgent = (overrides = {}) => ({
  _id: 'mock-agent-id',
  name: 'Mock Agent',
  email: 'agent@test.com',
  phone: '+1234567890',
  active: true,
  current_location: { lat: 40.7128, lng: -74.0060 },
  performance_score: 4.5,
  ...overrides
});

mockData.createMockCustomer = (overrides = {}) => ({
  _id: 'mock-customer-id',
  name: 'Mock Customer',
  phone: '+0987654321',
  email: 'customer@test.com',
  address: '123 Mock Street',
  preferences: { language: 'en' },
  ...overrides
});

module.exports = mockData;