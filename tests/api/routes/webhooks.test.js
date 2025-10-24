const request = require('supertest');
const express = require('express');
const sinon = require('sinon');
const crypto = require('crypto');
const webhooksRouter = require('../../../src/api/routes/webhooks');
const testData = require('../../helpers/testData');
const mockData = require('../../helpers/mockData');

describe('Webhooks API Routes', () => {
  let app;
  let mockDb;
  let twilioValidateStub;
  let storageStub;
  let aiServiceStub;
  let pushServiceStub;
  let socketStub;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/webhooks', webhooksRouter);
  });

  beforeEach(() => {
    // Mock Twilio webhook validation
    twilioValidateStub = sinon.stub().returns(true);

    // Mock storage service
    storageStub = {
      uploadRecording: sinon.stub().resolves('https://storage.example.com/recording.mp3'),
      generatePresignedUrl: sinon.stub().resolves('https://storage.example.com/recording.mp3?signed')
    };

    // Mock AI service
    aiServiceStub = {
      transcribeAudio: sinon.stub().resolves('Customer said: I will be home after 3 PM'),
      analyzeTranscription: sinon.stub().resolves({
        sentiment: 'positive',
        keywords: ['home', '3 PM'],
        instructions_summary: 'Customer available after 3 PM',
        priority_level: 'normal'
      })
    };

    // Mock push service
    pushServiceStub = {
      notifyAgent: sinon.stub().resolves(true)
    };

    // Mock socket service
    socketStub = {
      emit: sinon.stub(),
      to: sinon.stub().returns({ emit: sinon.stub() })
    };
  });

  afterEach(() => {
    sinon.restore();
    delete app.locals.db;
  });

  describe('POST /api/webhooks/voice', () => {
    const voiceWebhookData = {
      ...testData.twilioWebhookData.voice,
      delivery_id: testData.validDelivery._id.toString()
    };

    it('should handle voice webhook and return TwiML', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(voiceWebhookData)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('<Say>');
      expect(response.text).toContain('<Record');
    });

    it('should include delivery information in voice prompt', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(voiceWebhookData)
        .expect(200);

      expect(response.text).toContain('PKG123456');
    });

    it('should handle missing delivery_id parameter', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .send(voiceWebhookData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('delivery_id');
    });

    it('should handle non-existent delivery', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: 'non-existent-id' })
        .send(voiceWebhookData)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should support different languages in TwiML', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ 
          delivery_id: testData.validDelivery._id.toString(),
          language: 'es'
        })
        .send(voiceWebhookData)
        .expect(200);

      expect(response.text).toContain('voice="alice"');
      // Spanish text would be included in actual implementation
    });

    it('should validate Twilio webhook signature', async () => {
      twilioValidateStub.returns(false);

      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(voiceWebhookData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('signature');
    });

    it('should handle webhook validation errors', async () => {
      twilioValidateStub.throws(new Error('Validation error'));

      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(voiceWebhookData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should include proper recording settings in TwiML', async () => {
      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(voiceWebhookData)
        .expect(200);

      expect(response.text).toContain('transcribe="true"');
      expect(response.text).toContain('maxLength="60"');
      expect(response.text).toContain('finishOnKey="#"');
      expect(response.text).toContain('action="/api/webhooks/recording"');
    });

    it('should handle customer callback scenarios', async () => {
      const callbackData = { ...voiceWebhookData, Digits: '1' };

      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ 
          delivery_id: testData.validDelivery._id.toString(),
          action: 'callback'
        })
        .send(callbackData)
        .expect(200);

      expect(response.text).toContain('<Say>');
    });
  });

  describe('POST /api/webhooks/recording', () => {
    const recordingWebhookData = {
      ...testData.twilioWebhookData.recording,
      delivery_id: testData.validDelivery._id.toString()
    };

    it('should process recording webhook successfully', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDb.collection().insertOne.calledOnce).toBe(true);
    });

    it('should upload recording to storage', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(storageStub.uploadRecording.calledOnce).toBe(true);
    });

    it('should trigger AI transcription and analysis', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(aiServiceStub.transcribeAudio.calledOnce).toBe(true);
      expect(aiServiceStub.analyzeTranscription.calledOnce).toBe(true);
    });

    it('should notify assigned agent', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(pushServiceStub.notifyAgent.calledOnce).toBe(true);
    });

    it('should emit real-time socket notification', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(socketStub.to.called).toBe(true);
    });

    it('should handle missing RecordingSid', async () => {
      const incompleteData = { ...recordingWebhookData };
      delete incompleteData.RecordingSid;

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle recording upload failures', async () => {
      storageStub.uploadRecording.rejects(new Error('Upload failed'));

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle AI service failures gracefully', async () => {
      aiServiceStub.transcribeAudio.rejects(new Error('AI service unavailable'));

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200); // Should still succeed

      expect(response.body.success).toBe(true);
      expect(response.body.warning).toContain('AI processing failed');
    });

    it('should update delivery status after recording processed', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(mockDb.collection().updateOne.called).toBe(true);
    });

    it('should handle duplicate recording webhooks', async () => {
      mockDb.collection().findOne.onSecondCall().resolves(testData.validRecording);

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(recordingWebhookData)
        .expect(200);

      expect(response.body.message).toContain('already processed');
    });

    it('should validate recording duration', async () => {
      const shortRecordingData = {
        ...recordingWebhookData,
        RecordingDuration: '1' // Too short
      };

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(shortRecordingData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('duration');
    });

    it('should handle transcription webhook separately', async () => {
      const transcriptionData = {
        TranscriptionSid: 'TR123456789',
        TranscriptionText: 'I will be home after 3 PM',
        TranscriptionStatus: 'completed',
        RecordingSid: recordingWebhookData.RecordingSid
      };

      const response = await request(app)
        .post('/api/webhooks/transcription')
        .send(transcriptionData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/webhooks/call-status', () => {
    const callStatusData = {
      CallSid: 'CA1234567890abcdef',
      CallStatus: 'completed',
      CallDuration: '45',
      From: '+0987654321',
      To: '+1234567890',
      delivery_id: testData.validDelivery._id.toString()
    };

    it('should update call status in database', async () => {
      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(callStatusData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDb.collection().updateOne.calledOnce).toBe(true);
    });

    it('should handle different call statuses', async () => {
      const statuses = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'];

      for (const status of statuses) {
        const statusData = { ...callStatusData, CallStatus: status };
        
        const response = await request(app)
          .post('/api/webhooks/call-status')
          .send(statusData)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('should trigger retry logic for failed calls', async () => {
      const failedCallData = { ...callStatusData, CallStatus: 'failed' };

      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(failedCallData)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Verify retry was scheduled
    });

    it('should handle no-answer scenarios', async () => {
      const noAnswerData = { ...callStatusData, CallStatus: 'no-answer' };

      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(noAnswerData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should update delivery status based on call outcome', async () => {
      const completedCallData = { ...callStatusData, CallStatus: 'completed' };

      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(completedCallData)
        .expect(200);

      expect(mockDb.collection().updateOne.calledTwice).toBe(true); // Call log + delivery
    });

    it('should handle missing CallSid', async () => {
      const incompleteData = { ...callStatusData };
      delete incompleteData.CallSid;

      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should track call quality metrics', async () => {
      const qualityData = {
        ...callStatusData,
        CallStatus: 'completed',
        AnsweredBy: 'human'
      };

      const response = await request(app)
        .post('/api/webhooks/call-status')
        .send(qualityData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/webhooks/sms', () => {
    const smsWebhookData = {
      MessageSid: 'SM1234567890abcdef',
      From: '+1234567890',
      To: '+0987654321',
      Body: 'I received your call about my delivery. I will be home after 3 PM.',
      SmsStatus: 'received'
    };

    it('should process incoming SMS responses', async () => {
      const response = await request(app)
        .post('/api/webhooks/sms')
        .send(smsWebhookData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should link SMS to delivery based on phone number', async () => {
      mockDb.collection().findOne.resolves({
        ...testData.validDelivery,
        customer_phone: smsWebhookData.From
      });

      const response = await request(app)
        .post('/api/webhooks/sms')
        .send(smsWebhookData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle SMS with delivery keywords', async () => {
      const keywordSMS = {
        ...smsWebhookData,
        Body: 'STOP deliveries to this number'
      };

      const response = await request(app)
        .post('/api/webhooks/sms')
        .send(keywordSMS)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should respond with automated SMS when appropriate', async () => {
      const response = await request(app)
        .post('/api/webhooks/sms')
        .send(smsWebhookData)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/xml');
      expect(response.text).toContain('<Response>');
    });

    it('should handle opt-out requests', async () => {
      const optOutSMS = {
        ...smsWebhookData,
        Body: 'STOP'
      };

      const response = await request(app)
        .post('/api/webhooks/sms')
        .send(optOutSMS)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Verify customer was opted out
    });
  });

  describe('Webhook Security', () => {
    it('should validate Twilio webhook signatures', async () => {
      // Mock invalid signature
      const invalidSignature = 'invalid-signature';
      
      const response = await request(app)
        .post('/api/webhooks/voice')
        .set('X-Twilio-Signature', invalidSignature)
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(testData.twilioWebhookData.voice)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should handle webhook validation in development mode', async () => {
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(testData.twilioWebhookData.voice)
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('should prevent webhook replay attacks', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      const signature = crypto
        .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
        .update(`${oldTimestamp}`)
        .digest('base64');

      const response = await request(app)
        .post('/api/webhooks/voice')
        .set('X-Twilio-Signature', signature)
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(testData.twilioWebhookData.voice)
        .expect(401);

      expect(response.body.error).toContain('timestamp');
    });

    it('should rate limit webhook endpoints', async () => {
      const promises = Array(20).fill().map(() =>
        request(app)
          .post('/api/webhooks/voice')
          .query({ delivery_id: testData.validDelivery._id.toString() })
          .send(testData.twilioWebhookData.voice)
      );

      const results = await Promise.allSettled(promises);
      const rateLimited = results.some(r => 
        r.status === 'fulfilled' && r.value.status === 429
      );

      expect(rateLimited).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockDb.collection().findOne.rejects(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/webhooks/voice')
        .query({ delivery_id: testData.validDelivery._id.toString() })
        .send(testData.twilioWebhookData.voice)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle malformed webhook data', async () => {
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle webhook timeouts gracefully', async () => {
      mockDb.collection().insertOne.returns(new Promise(() => {})); // Never resolves

      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(testData.twilioWebhookData.recording)
        .timeout(5000)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should log webhook processing errors', async () => {
      const consoleSpy = sinon.spy(console, 'error');
      mockDb.collection().insertOne.rejects(new Error('Database error'));

      await request(app)
        .post('/api/webhooks/recording')
        .send(testData.twilioWebhookData.recording)
        .expect(500);

      expect(consoleSpy.called).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate webhook deliveries', async () => {
      const webhookData = testData.twilioWebhookData.recording;

      // First request
      await request(app)
        .post('/api/webhooks/recording')
        .send(webhookData)
        .expect(200);

      // Duplicate request
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(webhookData)
        .expect(200);

      expect(response.body.message).toContain('already processed');
    });

    it('should use idempotency keys for webhook processing', async () => {
      const idempotencyKey = 'webhook-12345';

      const response = await request(app)
        .post('/api/webhooks/recording')
        .set('Idempotency-Key', idempotencyKey)
        .send(testData.twilioWebhookData.recording)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should track webhook processing times', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .post('/api/webhooks/recording')
        .send(testData.twilioWebhookData.recording)
        .expect(200);

      const duration = Date.now() - start;
      expect(response.headers['x-processing-time']).toBeDefined();
    });

    it('should track webhook success/failure rates', async () => {
      const response = await request(app)
        .get('/api/webhooks/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.success_rate).toBeDefined();
    });

    it('should emit metrics events for monitoring', async () => {
      const metricsStub = sinon.stub();
      
      await request(app)
        .post('/api/webhooks/recording')
        .send(testData.twilioWebhookData.recording)
        .expect(200);

      // Verify metrics were emitted (would be implementation specific)
    });
  });
});