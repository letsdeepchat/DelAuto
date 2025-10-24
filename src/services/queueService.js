const Queue = require('bull');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis connection
const redis = new Redis(redisUrl);

// Create call queue
const callQueue = new Queue('delivery-calls', redisUrl);

// Add job to call queue
async function addCallJob(deliveryData, delay = 0) {
  const job = await callQueue.add('initiate-call', deliveryData, {
    delay,
    removeOnComplete: 10,
    removeOnFail: 5,
  });
  return job;
}

// Get queue status
async function getQueueStatus() {
  const waiting = await callQueue.getWaiting();
  const active = await callQueue.getActive();
  const completed = await callQueue.getCompleted();
  const failed = await callQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
  };
}

module.exports = {
  callQueue,
  addCallJob,
  getQueueStatus,
  redis,
};
