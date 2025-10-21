const request = require('supertest');
const mongoose = require('mongoose');
const sinon = require('sinon');
const nock = require('nock');
// const { app } = require('../../src/index.js'); // Commented out to avoid port conflicts
const testData = require('../helpers/testData');
const mockData = require('../helpers/mockData');

describe.skip('End-to-End Integration Tests', () => {
  let mockDb;
  let twilioStubs;
  let aiStubs;
  let storageStubs;
  let testDelivery;
  let testAgent;
  let testCustomer;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI);
  });

  beforeEach(async () => {
    // Clear test database
    await mongoose.connection.db.dropDatabase();

    // Create test data
    const linkedData = testData.createLinkedTestData();
    testCustomer = linkedData.customer;
    testAgent = linkedData.agent;
    testDelivery = linkedData.delivery;

    // Mock external services
    setupMocks();

    // Create test data in database
    await createTestData();

    // Clean up nock
    nock.cleanAll();
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  function setupMocks() {
    // Mock Twilio
    twilioStubs = {
      calls: {
        create: sinon.stub().resolves(mockData.twilio.callResponse),
        get: sinon.stub().returns({
          fetch: sinon.stub().resolves(mockData.twilio.callResponse)
        })
      },
      recordings: {
        get: sinon.stub().returns({
          fetch: sinon.stub().resolves(mockData.twilio.recordingResponse)
        })
      }
    };

    // Mock AI services
    aiStubs = {
      transcribeAudio: sinon.stub().resolves({
        success: true,
        transcription: 'I will be home at 3 PM. Please leave at front door.'
      }),
      analyzeTranscription: sinon.stub().resolves({
        success: true,
        analysis: {
          sentiment: 'positive',
          keywords: ['home', '3 PM', 'front door'],
          instructions_summary: 'Customer available at 3 PM, leave at front door',
          priority_level: 'normal'
        }
      })
    };

    // Mock storage service
    storageStubs = {
      uploadRecording: sinon.stub().resolves('https://storage.example.com/recording.mp3')
    };

    // Mock external HTTP calls
    nock('https://api.twilio.com')
      .persist()
      .post(/.*/)
      .reply(200, mockData.twilio.callResponse)
      .get(/.*/)
      .reply(200, mockData.twilio.recordingResponse);

    nock('https://storage.example.com')
      .persist()
      .get(/.*\.mp3/)
      .reply(200, Buffer.from('fake-audio-data'), {
        'Content-Type': 'audio/mpeg'
      });
  }

  async function createTestData() {
    // This would create test data in the actual database
    // Implementation depends on your database models
    console.log('Creating test data in database...');
  }

  describe('Complete Delivery Workflow', () => {
    it('should handle complete delivery lifecycle', async () => {
      // 1. Create delivery
      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-001',
          address: '123 Test Street, Test City',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          priority: 'normal'
        })
        .expect(201);

      expect(deliveryResponse.body.success).toBe(true);
      const deliveryId = deliveryResponse.body.data._id;

      // 2. Initiate customer call
      const callResponse = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: deliveryId,
          customer_phone: testCustomer.phone,
          scheduled_time: new Date().toISOString()
        })
        .expect(200);

      expect(callResponse.body.success).toBe(true);
      const callSid = callResponse.body.data.call_sid;

      // 3. Simulate Twilio voice webhook
      const voiceWebhookResponse = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: deliveryId })
        .send({
          CallSid: callSid,
          From: testCustomer.phone,
          To: process.env.TWILIO_PHONE_NUMBER,
          CallStatus: 'in-progress'
        })
        .expect(200);

      expect(voiceWebhookResponse.headers['content-type']).toContain('text/xml');
      expect(voiceWebhookResponse.text).toContain('<Response>');

      // 4. Simulate recording webhook
      const recordingResponse = await request(app)
        .post('/api/webhooks/recording')
        .send({
          RecordingSid: 'RE123456789',
          RecordingUrl: 'https://api.twilio.com/recordings/RE123.mp3',
          RecordingStatus: 'completed',
          RecordingDuration: '45',
          CallSid: callSid,
          delivery_id: deliveryId
        })
        .expect(200);

      expect(recordingResponse.body.success).toBe(true);

      // 5. Verify call status update webhook
      const statusResponse = await request(app)
        .post('/api/webhooks/call-status')
        .send({
          CallSid: callSid,
          CallStatus: 'completed',
          CallDuration: '45',
          delivery_id: deliveryId
        })
        .expect(200);

      expect(statusResponse.body.success).toBe(true);

      // 6. Agent retrieves recording
      const agentAuth = await authenticateAgent(testAgent);
      const recordingRetrievalResponse = await request(app)
        .get(`/api/recordings/delivery/${deliveryId}`)
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .expect(200);

      expect(recordingRetrievalResponse.body.success).toBe(true);
      expect(recordingRetrievalResponse.body.data.transcription).toBeDefined();
      expect(recordingRetrievalResponse.body.data.ai_analysis).toBeDefined();

      // 7. Agent updates delivery status
      const deliveryUpdateResponse = await request(app)
        .put(`/api/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .send({
          status: 'completed',
          completion_notes: 'Delivered to front door as requested'
        })
        .expect(200);

      expect(deliveryUpdateResponse.body.success).toBe(true);

      // 8. Verify analytics are updated
      const analyticsResponse = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.data.deliveries.total).toBeGreaterThan(0);
    }, 30000); // Extended timeout for complex workflow

    it('should handle failed call scenario with retry', async () => {
      // Mock failed call
      twilioStubs.calls.create.rejects({ code: 21217, message: 'Phone number not reachable' });

      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-002',
          address: '456 Test Avenue',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const deliveryId = deliveryResponse.body.data._id;

      // Attempt call - should fail
      const callResponse = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: deliveryId,
          customer_phone: '+1234567890', // Invalid number
          scheduled_time: new Date().toISOString()
        })
        .expect(500);

      expect(callResponse.body.success).toBe(false);

      // Retry with correct number
      twilioStubs.calls.create.resolves(mockData.twilio.callResponse);

      const retryResponse = await request(app)
        .post('/api/calls/retry')
        .send({
          delivery_id: deliveryId,
          reason: 'Invalid phone number corrected',
          delay_minutes: 5
        })
        .expect(200);

      expect(retryResponse.body.success).toBe(true);
      expect(retryResponse.body.data.retry_scheduled).toBe(true);
    });

    it('should handle customer no-answer scenario', async () => {
      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-003',
          address: '789 Test Boulevard',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const deliveryId = deliveryResponse.body.data._id;

      const callResponse = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: deliveryId,
          customer_phone: testCustomer.phone,
          scheduled_time: new Date().toISOString()
        })
        .expect(200);

      const callSid = callResponse.body.data.call_sid;

      // Simulate no-answer webhook
      const noAnswerResponse = await request(app)
        .post('/api/webhooks/call-status')
        .send({
          CallSid: callSid,
          CallStatus: 'no-answer',
          CallDuration: '0',
          delivery_id: deliveryId
        })
        .expect(200);

      expect(noAnswerResponse.body.success).toBe(true);

      // Verify automatic retry was scheduled
      // This would check the queue system for scheduled retry
    });
  });

  describe('Multi-language Support Integration', () => {
    it('should handle Spanish language delivery workflow', async () => {
      // Create Spanish-speaking customer
      const spanishCustomer = {
        ...testCustomer,
        preferences: { language: 'es' }
      };

      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: spanishCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-ES-001',
          address: '123 Calle de Prueba',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const deliveryId = deliveryResponse.body.data._id;

      const callResponse = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: deliveryId,
          customer_phone: spanishCustomer.phone,
          language: 'es',
          scheduled_time: new Date().toISOString()
        })
        .expect(200);

      // Voice webhook should return Spanish TwiML
      const voiceResponse = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: deliveryId, language: 'es' })
        .send({
          CallSid: callResponse.body.data.call_sid,
          From: spanishCustomer.phone,
          To: process.env.TWILIO_PHONE_NUMBER
        })
        .expect(200);

      expect(voiceResponse.text).toContain('voice="Polly.Conchita"');
    });
  });

  describe('Real-time Notifications Integration', () => {
    it('should send push notifications to agents when recording is ready', async () => {
      const agentAuth = await authenticateAgent(testAgent);

      // Subscribe agent to push notifications
      const subscriptionResponse = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .send({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
            keys: {
              auth: 'test-auth-key',
              p256dh: 'test-p256dh-key'
            }
          }
        })
        .expect(200);

      expect(subscriptionResponse.body.success).toBe(true);

      // Mock web push service
      nock('https://fcm.googleapis.com')
        .post(/.*/)
        .reply(201, { success: true });

      // Create delivery and recording
      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-PUSH-001',
          address: '123 Notification Street',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      // Trigger recording webhook (should send push notification)
      const recordingResponse = await request(app)
        .post('/api/webhooks/recording')
        .send({
          RecordingSid: 'RE987654321',
          RecordingUrl: 'https://api.twilio.com/recordings/RE987.mp3',
          RecordingStatus: 'completed',
          RecordingDuration: '30',
          CallSid: 'CA987654321',
          delivery_id: deliveryResponse.body.data._id
        })
        .expect(200);

      expect(recordingResponse.body.success).toBe(true);

      // Verify push notification was sent
      // This would check the push service was called
    });
  });

  describe('Analytics and AI Integration', () => {
    it('should process recordings with AI and update analytics', async () => {
      // Mock AI responses
      aiStubs.transcribeAudio.resolves({
        success: true,
        transcription: 'I will be available between 2 PM and 4 PM today. Please call before coming.'
      });

      aiStubs.analyzeTranscription.resolves({
        success: true,
        analysis: {
          sentiment: 'positive',
          keywords: ['available', '2 PM', '4 PM', 'call before'],
          instructions_summary: 'Customer available 2-4 PM, wants advance call',
          priority_level: 'normal',
          special_instructions: 'Call before delivery'
        }
      });

      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'TEST-PKG-AI-001',
          address: '123 AI Analytics Lane',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      const deliveryId = deliveryResponse.body.data._id;

      // Process recording with AI
      const aiProcessingResponse = await request(app)
        .post('/api/analytics/ai/process-recording')
        .send({
          recording_id: 'test-recording-id',
          audio_url: 'https://storage.example.com/test-recording.mp3',
          delivery_id: deliveryId
        })
        .expect(200);

      expect(aiProcessingResponse.body.success).toBe(true);
      expect(aiProcessingResponse.body.data.transcription).toBeDefined();
      expect(aiProcessingResponse.body.data.analysis).toBeDefined();
      expect(aiProcessingResponse.body.data.analysis.special_instructions).toBe('Call before delivery');

      // Verify analytics are updated
      const analyticsResponse = await request(app)
        .get('/api/analytics/dashboard')
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
    });

    it('should generate customer response pattern insights', async () => {
      // Create multiple deliveries and recordings
      const deliveries = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/deliveries')
          .send({
            customer_id: testCustomer._id.toString(),
            agent_id: testAgent._id.toString(),
            package_id: `TEST-PKG-PATTERN-${i}`,
            address: `${100 + i} Pattern Street`,
            scheduled_time: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString()
          })
          .expect(201);

        deliveries.push(response.body.data);
      }

      // Get customer response patterns
      const patternsResponse = await request(app)
        .get('/api/analytics/customer-response-patterns')
        .query({ customer_id: testCustomer._id.toString() })
        .expect(200);

      expect(patternsResponse.body.success).toBe(true);
      expect(patternsResponse.body.data.response_rate).toBeDefined();
      expect(patternsResponse.body.data.common_responses).toBeDefined();
    });
  });

  describe('Smart Agent Assignment Integration', () => {
    it('should assign agent based on delivery complexity and performance', async () => {
      // Create agents with different performance scores
      const agents = [
        { ...testAgent, performance_score: 4.8, specialties: ['complex_deliveries'] },
        { ...testAgent, _id: 'agent-2', performance_score: 4.2, specialties: ['standard_deliveries'] }
      ];

      // Complex delivery
      const complexDelivery = {
        customer_id: testCustomer._id.toString(),
        package_id: 'COMPLEX-PKG-001',
        address: '999 Complex Delivery Tower, Floor 50',
        scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        special_requirements: ['signature_required', 'fragile', 'time_sensitive']
      };

      const assignmentResponse = await request(app)
        .post('/api/routing/assign-agent')
        .send({
          delivery: complexDelivery,
          available_agents: agents.map(a => a._id.toString())
        })
        .expect(200);

      expect(assignmentResponse.body.success).toBe(true);
      expect(assignmentResponse.body.data.assigned_agent).toBeDefined();
      expect(assignmentResponse.body.data.reasoning).toBeDefined();

      // Create delivery with assigned agent
      const deliveryResponse = await request(app)
        .post('/api/deliveries')
        .send({
          ...complexDelivery,
          agent_id: assignmentResponse.body.data.assigned_agent
        })
        .expect(201);

      expect(deliveryResponse.body.success).toBe(true);
    });
  });

  describe('Mobile App API Integration', () => {
    it('should provide mobile-optimized agent dashboard', async () => {
      const agentAuth = await authenticateAgent(testAgent);

      // Create test deliveries for agent
      await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: testCustomer._id.toString(),
          agent_id: testAgent._id.toString(),
          package_id: 'MOBILE-PKG-001',
          address: '123 Mobile Street',
          scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          status: 'assigned'
        })
        .expect(201);

      const mobileResponse = await request(app)
        .get('/api/mobile/dashboard')
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .set('User-Agent', 'DelAuto Mobile App v1.0')
        .expect(200);

      expect(mobileResponse.body.success).toBe(true);
      expect(mobileResponse.body.data).toHaveProperty('assigned_deliveries');
      expect(mobileResponse.body.data).toHaveProperty('recent_recordings');
      expect(mobileResponse.body.data).toHaveProperty('daily_stats');

      // Verify bandwidth optimization
      expect(mobileResponse.headers['content-length']).toBeDefined();
      const responseSize = parseInt(mobileResponse.headers['content-length']);
      expect(responseSize).toBeLessThan(10000); // Should be compact for mobile
    });

    it('should handle offline capability for mobile agents', async () => {
      const agentAuth = await authenticateAgent(testAgent);

      // Get deliveries for offline sync
      const syncResponse = await request(app)
        .get('/api/mobile/offline-sync')
        .set('Authorization', `Bearer ${agentAuth.token}`)
        .query({ 
          last_sync: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
        })
        .expect(200);

      expect(syncResponse.body.success).toBe(true);
      expect(syncResponse.body.data).toHaveProperty('deliveries');
      expect(syncResponse.body.data).toHaveProperty('recordings');
      expect(syncResponse.body.data).toHaveProperty('sync_timestamp');
    });
  });

  describe('Admin Dashboard Integration', () => {
    it('should provide comprehensive system overview for admins', async () => {
      const adminAuth = await authenticateAdmin();

      const adminDashboardResponse = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .expect(200);

      expect(adminDashboardResponse.body.success).toBe(true);
      expect(adminDashboardResponse.body.data).toHaveProperty('system_health');
      expect(adminDashboardResponse.body.data).toHaveProperty('delivery_stats');
      expect(adminDashboardResponse.body.data).toHaveProperty('agent_performance');
      expect(adminDashboardResponse.body.data).toHaveProperty('cost_analysis');
    });

    it('should allow admin to manage agents and deliveries', async () => {
      const adminAuth = await authenticateAdmin();

      // Create new agent
      const newAgentResponse = await request(app)
        .post('/api/admin/agents')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          name: 'Test Agent 2',
          email: 'agent2@test.com',
          phone: '+1234567891',
          active: true
        })
        .expect(201);

      expect(newAgentResponse.body.success).toBe(true);

      // Get all agents
      const agentsResponse = await request(app)
        .get('/api/admin/agents')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .expect(200);

      expect(agentsResponse.body.success).toBe(true);
      expect(agentsResponse.body.data.agents.length).toBeGreaterThan(0);
    });
  });

  describe('System Health and Monitoring Integration', () => {
    it('should provide health check endpoint', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.checks).toHaveProperty('database');
      expect(healthResponse.body.checks).toHaveProperty('queue');
      expect(healthResponse.body.checks).toHaveProperty('external_services');
    });

    it('should provide detailed metrics', async () => {
      const metricsResponse = await request(app)
        .get('/metrics')
        .expect(200);

      expect(metricsResponse.body).toHaveProperty('system');
      expect(metricsResponse.body).toHaveProperty('application');
      expect(metricsResponse.body).toHaveProperty('business');
    });
  });

  // Helper functions
  async function authenticateAgent(agent) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: agent.email || 'agent@test.com',
        password: 'test123',
        role: 'agent'
      });

    return response.body.data;
  }

  async function authenticateAdmin() {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'admin123',
        role: 'admin'
      });

    return response.body.data;
  }
});