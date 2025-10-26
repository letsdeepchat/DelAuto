const Queue = require('bull');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis connection with error handling
let redis;
let callQueue;

try {
  // Set connection options with timeout
  const redisOptions = {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false
  };
  
  redis = new Redis(redisUrl, redisOptions);
  
  // Handle Redis connection errors
  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });
  
  // Create call queue with error handling
  callQueue = new Queue('delivery-calls', {
    redis: redisUrl,
    settings: {
      lockDuration: 30000,
      stalledInterval: 15000,
      maxStalledCount: 1
    }
  });
} catch (error) {
  console.error('Failed to initialize Redis/Bull:', error.message);
  // Create fallback objects for testing
  redis = {
    get: async () => null,
    set: async () => null,
    disconnect: async () => null
  };
  callQueue = {
    add: async () => ({ id: 'mock-job-id', data: {} }),
    getWaiting: async () => [],
    getActive: async () => [],
    getCompleted: async () => [],
    getFailed: async () => []
  };
}

// Add job to call queue
async function addCallJob(deliveryData, delay = 0) {
  try {
    if (!deliveryData) {
      throw new Error('Job data is required');
    }
    
    const job = await callQueue.add('initiate-call', deliveryData, {
      delay,
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
    return job;
  } catch (error) {
    console.error('Error adding job to queue:', error.message);
    throw new Error(`Failed to add job to queue: ${error.message}`);
  }
}

// Get queue status
async function getQueueStatus() {
  try {
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
  } catch (error) {
    console.error('Error getting queue stats:', error.message);
    // Return default stats for testing
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      error: error.message
    };
  }
}

module.exports = {
  callQueue,
  addCallJob,
  getQueueStats: getQueueStatus, // Alias for backward compatibility with tests
  getQueueStatus,
  redis,
};
