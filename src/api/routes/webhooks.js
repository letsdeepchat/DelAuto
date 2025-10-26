const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const axios = require('axios');
const Queue = require('bull');
const CallLog = require('../../database/models/CallLog');
const Recording = require('../../database/models/Recording');
const Delivery = require('../../database/models/Delivery');
const Agent = require('../../database/models/Agent');
const storageService = require('../../services/storageService');
const twilioService = require('../../services/twilioService');
const pushService = require('../../services/pushService');

// Async queue for webhook processing
const webhookQueue = new Queue('webhooks', process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Middleware to validate Twilio webhook
const validateTwilioWebhook = (req, res, next) => {
  const twilioSignature = req.get('X-Twilio-Signature');
  const url = process.env.BASE_URL + req.originalUrl;

  if (!twilioSignature) {
    return res.status(401).json({ error: 'Missing Twilio signature' });
  }

  // Validate Twilio signature
  const twilio = require('twilio');
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!valid) {
    return res.status(401).json({ error: 'Invalid Twilio signature' });
  }

  next();
};

// POST /api/webhooks/voice - Handle voice call flow
router.post('/voice', validateTwilioWebhook, async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    const deliveryId = req.query.delivery_id;

    if (!deliveryId) {
      twiml.say('Sorry, there was an error with this call.');
      return res.type('text/xml').send(twiml.toString());
    }

    twiml.say(
      { voice: 'alice' },
      'Hello! This is regarding your delivery scheduled for today. Please record your availability or special delivery instructions after the beep.',
    );
    twiml.record({
      action: `${process.env.BASE_URL}/api/webhooks/recording?delivery_id=${deliveryId}`,
      maxLength: 60,
      finishOnKey: '#',
      transcribe: true,
      transcribeCallback: `${process.env.BASE_URL}/api/webhooks/transcription?delivery_id=${deliveryId}`,
    });
    twiml.say('We did not receive your message. Goodbye.');

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Error handling voice webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// POST /api/webhooks/recording - Handle recording completion with validation
router.post('/recording', validateTwilioWebhook, async (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingDuration } = req.body;
    const deliveryId = req.query.delivery_id;

    // Validate required fields using Joi
    const Joi = require('joi');
    const schema = Joi.object({
      CallSid: Joi.string().required(),
      RecordingUrl: Joi.string().uri().required(),
      RecordingDuration: Joi.number().min(1).required(),
    });

    const { error } = schema.validate({ CallSid, RecordingUrl, RecordingDuration });
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Respond immediately to Twilio
    res.status(200).json({ message: 'Recording processed successfully' });

    // Process asynchronously
    await webhookQueue.add({
      type: 'recording',
      CallSid,
      RecordingUrl,
      RecordingDuration,
      deliveryId
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });

  } catch (error) {
    console.error('Error queuing recording webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// Process recording webhooks asynchronously
webhookQueue.process('recording', async (job) => {
  const { CallSid, RecordingUrl, RecordingDuration, deliveryId } = job.data;

  // Find and update call log with recording info
  const callLog = await CallLog.findOneAndUpdate(
    { call_sid: CallSid },
    { recording_url: RecordingUrl, duration: RecordingDuration },
    { new: true },
  );

  if (callLog) {
    let finalAudioUrl = RecordingUrl;

    // Download recording from Twilio and upload to Cloudflare R2
    try {
      if (
        storageService &&
        process.env.R2_ACCESS_KEY_ID !== 'dummy_access_key'
      ) {
        const response = await axios.get(RecordingUrl, {
          responseType: 'arraybuffer',
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN,
          },
        });

        const fileName = `recording-${CallSid}.wav`;
        finalAudioUrl = await storageService.uploadRecording(
          response.data,
          fileName,
        );
        console.log('Recording uploaded to R2:', finalAudioUrl);
      }
    } catch (error) {
      console.error(
        'Error uploading recording to R2, using Twilio URL:',
        error,
      );
      // Fall back to Twilio URL if R2 upload fails
    }

    // Create recording entry
    const recording = new Recording({
      call_log_id: callLog._id,
      audio_url: finalAudioUrl,
      duration: RecordingDuration,
    });
    await recording.save();

    // Notify agent if delivery has an agent assigned
    const delivery = await Delivery.findById(callLog.delivery_id).populate(
      'agent_id',
    );
    if (delivery && delivery.agent_id) {
      // Send SMS notification
      try {
        await twilioService.twilioClient.messages.create({
          body: `New customer recording available for delivery at ${delivery.address}. Check the app for details.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: delivery.agent_id.phone,
        });
      } catch (error) {
        console.error('Error sending SMS to agent:', error);
      }

      // Send push notification
      try {
        await pushService.sendNewRecordingNotification(
          delivery.agent_id,
          delivery,
          finalAudioUrl,
        );
      } catch (error) {
        console.error('Error sending push notification:', error);
      }

      // Emit real-time notification via Socket.io
      const { io } = require('../../index');
      io.to(`agent_${delivery.agent_id._id}`).emit('new-recording', {
        deliveryId: delivery._id,
        address: delivery.address,
        customer: delivery.customer_id,
        recordingUrl: finalAudioUrl,
        duration: RecordingDuration,
      });
    }
  }
});

// POST /api/webhooks/transcription - Handle transcription completion
router.post('/transcription', validateTwilioWebhook, async (req, res) => {
  try {
    const { TranscriptionText, CallSid } = req.body;

    // Find call log by call_sid
    const callLog = await CallLog.findOne({ call_sid: CallSid });

    if (callLog) {
      // Update recording with transcription
      await Recording.findOneAndUpdate(
        { call_log_id: callLog._id },
        { transcription: TranscriptionText },
      );
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling transcription webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// POST /api/webhooks/call-status - Handle call status updates
router.post('/call-status', validateTwilioWebhook, async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    // Update call log status
    await CallLog.findOneAndUpdate(
      { call_sid: CallSid },
      { status: CallStatus, duration: CallDuration },
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling call status webhook:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
