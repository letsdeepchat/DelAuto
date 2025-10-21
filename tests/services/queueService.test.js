// WORKING QUEUE SERVICE TESTS - Based on actual implementation
const queueService = require('../../src/services/queueService');

// Mock Redis and Bull to avoid external dependencies
jest.mock('ioredis');
jest.mock('bull');

const mockJob = {
  id: 'test-job-123',
  data: { test: 'data' },
  opts: { delay: 0 }
};

// Mock Bull queue
const mockQueue = {
  add: jest.fn().mockResolvedValue(mockJob),
  getWaiting: jest.fn().mockResolvedValue([1, 2, 3]),
  getActive: jest.fn().mockResolvedValue([1, 2]),
  getCompleted: jest.fn().mockResolvedValue([1, 2, 3, 4, 5]),
  getFailed: jest.fn().mockResolvedValue([1])
};

// Mock Redis
const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn()
};

describe('QueueService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the queue methods
    queueService.callQueue = mockQueue;
    queueService.redis = mockRedis;
  });

  describe('addCallJob function', () => {
    it('should add a call job to the queue with default options', async () => {
      const deliveryData = {
        delivery_id: '507f1f77bcf86cd799439011',
        customer_phone: '+1234567890',
        address: '123 Main St'
      };

      const result = await queueService.addCallJob(deliveryData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'initiate-call',
        deliveryData,
        {
          delay: 0,
          removeOnComplete: 10,
          removeOnFail: 5
        }
      );
      expect(result).toEqual(mockJob);
    });

    it('should add a call job with custom delay', async () => {
      const deliveryData = {
        delivery_id: '507f1f77bcf86cd799439011',
        customer_phone: '+1234567890'
      };
      const delay = 5000;

      await queueService.addCallJob(deliveryData, delay);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'initiate-call',
        deliveryData,
        {
          delay: 5000,
          removeOnComplete: 10,
          removeOnFail: 5
        }
      );
    });

    it('should handle missing delivery data gracefully', async () => {
      const result = await queueService.addCallJob(null);
      
      expect(mockQueue.add).toHaveBeenCalledWith(
        'initiate-call',
        null,
        {
          delay: 0,
          removeOnComplete: 10,
          removeOnFail: 5
        }
      );
    });
  });

  describe('getQueueStatus function', () => {
    it('should return correct queue status counts', async () => {
      const result = await queueService.getQueueStatus();

      expect(result).toEqual({
        waiting: 3,
        active: 2,
        completed: 5,
        failed: 1
      });

      expect(mockQueue.getWaiting).toHaveBeenCalled();
      expect(mockQueue.getActive).toHaveBeenCalled();
      expect(mockQueue.getCompleted).toHaveBeenCalled();
      expect(mockQueue.getFailed).toHaveBeenCalled();
    });

    it('should handle queue errors gracefully', async () => {
      mockQueue.getWaiting.mockRejectedValue(new Error('Queue connection failed'));

      await expect(queueService.getQueueStatus()).rejects.toThrow('Queue connection failed');
    });
  });

  describe('exports object', () => {
    it('should export the correct functions and objects', () => {
      expect(queueService.callQueue).toBeDefined();
      expect(queueService.addCallJob).toBeInstanceOf(Function);
      expect(queueService.getQueueStatus).toBeInstanceOf(Function);
      expect(queueService.redis).toBeDefined();
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation, not assumptions!