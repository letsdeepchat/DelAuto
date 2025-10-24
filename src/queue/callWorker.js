const { callQueue } = require('../services/queueService');
const twilioService = require('../services/twilioService');
const Delivery = require('../database/models/Delivery');

// Process call jobs
callQueue.process('initiate-call', async (job) => {
  const { deliveryId } = job.data;

  try {
    // Get delivery details with populated customer info
    const delivery =
      await Delivery.findById(deliveryId).populate('customer_id');

    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Make the call
    const call = await twilioService.makeCustomerCall({
      _id: delivery._id,
      customer_phone: delivery.customer_id.phone,
    });

    console.log(`Call initiated for delivery ${deliveryId}, SID: ${call.sid}`);

    return { callSid: call.sid, status: call.status };
  } catch (error) {
    console.error(
      `Failed to process call job for delivery ${deliveryId}:`,
      error,
    );
    throw error;
  }
});

// Handle completed jobs
callQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});

// Handle failed jobs
callQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err.message);
});

console.log('Call worker started and listening for jobs...');

module.exports = callQueue;
