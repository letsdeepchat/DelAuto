const twilio = require('twilio');
const CallLog = require('../database/models/CallLog');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL;

let twilioClient = null;
if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

async function makeCustomerCall(delivery) {
  if (!twilioClient) {
    throw new Error(
      'Twilio client not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
    );
  }

  const call = await twilioClient.calls.create({
    url: `${baseUrl}/api/webhooks/voice?delivery_id=${delivery._id}`,
    to: delivery.customer_phone,
    from: twilioPhoneNumber,
    statusCallback: `${baseUrl}/api/webhooks/call-status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });

  // Save call log
  const callLog = new CallLog({
    delivery_id: delivery._id,
    call_sid: call.sid,
    status: call.status,
  });
  await callLog.save();

  return call;
}

module.exports = {
  makeCustomerCall,
  twilioClient,
};
