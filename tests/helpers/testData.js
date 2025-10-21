// Test data helpers and fixtures

const mongoose = require('mongoose');

const testData = {
  // Test customer data
  validCustomer: {
    _id: new mongoose.Types.ObjectId(),
    name: 'John Doe',
    phone: '+1234567890',
    email: 'john@example.com',
    address: '123 Test Street, Test City',
    preferences: {
      language: 'en',
      best_call_time: '10:00-18:00'
    }
  },

  // Test agent data
  validAgent: {
    _id: new mongoose.Types.ObjectId(),
    name: 'Agent Smith',
    email: 'agent@example.com',
    phone: '+0987654321',
    active: true,
    current_location: { lat: 40.7128, lng: -74.0060 },
    performance_score: 4.5
  },

  // Test delivery data
  validDelivery: {
    _id: new mongoose.Types.ObjectId(),
    customer_id: null, // Will be set dynamically
    agent_id: null, // Will be set dynamically
    package_id: 'PKG123456',
    address: '123 Test Street, Test City',
    scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    status: 'scheduled',
    instructions: '',
    priority: 'normal'
  },

  // Test call log data
  validCallLog: {
    _id: new mongoose.Types.ObjectId(),
    delivery_id: null, // Will be set dynamically
    call_sid: 'CA1234567890abcdef',
    status: 'completed',
    duration: 45,
    recording_url: 'https://api.twilio.com/recordings/RE123.mp3',
    recording_duration: 40,
    created_at: new Date()
  },

  // Test recording data
  validRecording: {
    _id: new mongoose.Types.ObjectId(),
    call_log_id: null, // Will be set dynamically
    delivery_id: null, // Will be set dynamically
    audio_url: 'https://api.twilio.com/recordings/RE123.mp3',
    transcription: 'I will be available at 3 PM. Please leave the package at the front door.',
    ai_analysis: {
      sentiment: 'positive',
      keywords: ['available', '3 PM', 'front door'],
      instructions_summary: 'Customer available at 3 PM, leave at front door',
      priority_level: 'normal'
    },
    status: 'processed'
  },

  // Test Twilio webhook data
  twilioWebhookData: {
    voice: {
      Called: '+1234567890',
      ToState: 'CA',
      CallerCountry: 'US',
      Direction: 'outbound-api',
      CallerState: 'CA',
      ToZip: '94105',
      CallSid: 'CA1234567890abcdef',
      To: '+1234567890',
      CallerZip: '94105',
      ToCountry: 'US',
      ApiVersion: '2010-04-01',
      CalledZip: '94105',
      CalledCity: 'San Francisco',
      CallStatus: 'completed',
      From: '+0987654321',
      AccountSid: 'AC1234567890abcdef',
      CalledCountry: 'US',
      CallerCity: 'San Francisco',
      Caller: '+0987654321',
      FromCountry: 'US',
      ToCity: 'San Francisco',
      FromCity: 'San Francisco',
      CalledState: 'CA',
      FromZip: '94105',
      FromState: 'CA'
    },
    recording: {
      AccountSid: 'AC1234567890abcdef',
      RecordingUrl: 'https://api.twilio.com/recordings/RE123.mp3',
      RecordingSid: 'RE1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: '45',
      CallSid: 'CA1234567890abcdef'
    }
  },

  // Test JWT tokens
  jwtTokens: {
    validAgent: null, // Will be generated in tests
    invalidAgent: 'invalid.jwt.token',
    expiredAgent: null // Will be generated with expired date
  },

  // Test push notification data
  pushNotification: {
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
      keys: {
        auth: 'test-auth-key',
        p256dh: 'test-p256dh-key'
      }
    },
    payload: {
      title: 'New Recording Available',
      body: 'Customer instructions ready for delivery PKG123456',
      data: {
        delivery_id: 'test-delivery-id',
        recording_id: 'test-recording-id'
      }
    }
  },

  // Test analytics data
  analyticsMetrics: {
    calls: {
      total: 1000,
      successful: 850,
      failed: 150,
      success_rate: 0.85
    },
    deliveries: {
      total: 950,
      first_attempt_success: 760,
      failed_attempts: 190,
      first_attempt_rate: 0.80
    },
    agents: {
      total_active: 25,
      average_performance: 4.2,
      compliance_rate: 0.92
    }
  }
};

// Helper function to create test data with relationships
testData.createLinkedTestData = () => {
  const customer = { ...testData.validCustomer };
  const agent = { ...testData.validAgent };
  const delivery = { 
    ...testData.validDelivery,
    customer_id: customer._id,
    agent_id: agent._id
  };
  const callLog = {
    ...testData.validCallLog,
    delivery_id: delivery._id
  };
  const recording = {
    ...testData.validRecording,
    call_log_id: callLog._id,
    delivery_id: delivery._id
  };

  return {
    customer,
    agent,
    delivery,
    callLog,
    recording
  };
};

module.exports = testData;