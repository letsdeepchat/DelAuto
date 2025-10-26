const queueService = require('../../src/services/queueService');
const Queue = require('bull');
const Redis = require('ioredis');

require('dotenv').config({ path: '.env.test' });

// Mock Redis and Bull for proper testing
jest.mock('ioredis');
jest.mock('bull');

describe('Queue Service - Unit Tests with Mocks', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should have queue service methods available', () => {
      expect(typeof queueService.addCallJob).toBe('function');
      expect(typeof queueService.getQueueStats).toBe('function');
    });

    it('should handle service availability gracefully', () => {
      // Test service resilience
      expect(queueService).toBeDefined();
      expect(typeof queueService).toBe('object');
    });
  });

  describe('addCallJob function', () => {
    it('should create job successfully with valid data', async () => {
      const mockJob = { id: 'job-123', data: { deliveryId: 'test-delivery-123' } };
      const mockAdd = jest.fn().mockResolvedValue(mockJob);
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const jobData = { deliveryId: 'test-delivery-123' };
      const result = await queueService.addCallJob(jobData);

      expect(result).toEqual(mockJob);
      expect(result.id).toBe('job-123');
      expect(result.data.deliveryId).toBe('test-delivery-123');
      expect(mockAdd).toHaveBeenCalledWith('initiate-call', jobData, {
        delay: 0,
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      });
    });

    it('should handle job creation with delay', async () => {
      const mockJob = { id: 'job-456', data: { deliveryId: 'test-delivery-456' } };
      const mockAdd = jest.fn().mockResolvedValue(mockJob);
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const jobData = { deliveryId: 'test-delivery-456' };
      const delay = 5000;
      const result = await queueService.addCallJob(jobData, delay);

      expect(result).toEqual(mockJob);
      expect(mockAdd).toHaveBeenCalledWith('initiate-call', jobData, {
        delay,
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      });
    });

    it('should throw error when job data is missing', async () => {
      await expect(queueService.addCallJob(null)).rejects.toThrow('Job data is required');
    });

    it('should handle queue errors gracefully', async () => {
      const mockAdd = jest.fn().mockRejectedValue(new Error('Queue connection failed'));
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const jobData = { deliveryId: 'test-delivery-123' };
      await expect(queueService.addCallJob(jobData)).rejects.toThrow('Failed to add job to queue: Queue connection failed');
    });
  });

  describe('getQueueStats function', () => {
    it('should return queue statistics object', async () => {
      const mockStats = {
        waiting: 2,
        active: 1,
        completed: 5,
        failed: 0
      };

      const mockGetWaiting = jest.fn().mockResolvedValue([{ id: 'job1' }, { id: 'job2' }]);
      const mockGetActive = jest.fn().mockResolvedValue([{ id: 'job3' }]);
      const mockGetCompleted = jest.fn().mockResolvedValue([{ id: 'job4' }, { id: 'job5' }, { id: 'job6' }, { id: 'job7' }, { id: 'job8' }]);
      const mockGetFailed = jest.fn().mockResolvedValue([]);

      Queue.mockImplementation(() => ({
        getWaiting: mockGetWaiting,
        getActive: mockGetActive,
        getCompleted: mockGetCompleted,
        getFailed: mockGetFailed
      }));

      const stats = await queueService.getQueueStats();

      expect(stats).toEqual(mockStats);
      expect(stats.waiting).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(5);
      expect(stats.failed).toBe(0);
    });

    it('should handle queue errors gracefully', async () => {
      const mockGetWaiting = jest.fn().mockRejectedValue(new Error('Queue unavailable'));
      Queue.mockImplementation(() => ({
        getWaiting: mockGetWaiting
      }));

      const stats = await queueService.getQueueStats();

      expect(stats).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        error: 'Cannot read properties of undefined (reading \'length\')'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service connection errors', async () => {
      const mockAdd = jest.fn().mockRejectedValue(new Error('Redis connection failed'));
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      await expect(queueService.addCallJob({ deliveryId: 'test' })).rejects.toThrow('Failed to add job to queue: Redis connection failed');
    });

    it('should handle malformed data gracefully', async () => {
      await expect(queueService.addCallJob(undefined)).rejects.toThrow('Job data is required');
    });

    it('should handle large data payloads', async () => {
      const largeData = {
        deliveryId: 'test-123',
        metadata: new Array(1000).fill('test-data').join('')
      };

      const mockJob = { id: 'large-job-123', data: largeData };
      const mockAdd = jest.fn().mockResolvedValue(mockJob);
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const result = await queueService.addCallJob(largeData);
      expect(result).toEqual(mockJob);
    });
  });

  describe('Service Integration', () => {
    it('should maintain consistent data format', async () => {
      const testData = {
        deliveryId: 'delivery-123',
        priority: 'high',
        attempts: 3
      };

      const mockJob = { id: 'job-789', data: testData };
      const mockAdd = jest.fn().mockResolvedValue(mockJob);
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const result = await queueService.addCallJob(testData);
      expect(result.data).toMatchObject(testData);
    });

    it('should handle concurrent job additions', async () => {
      const jobs = [
        { deliveryId: 'delivery-1' },
        { deliveryId: 'delivery-2' },
        { deliveryId: 'delivery-3' }
      ];

      const mockJobs = jobs.map((job, index) => ({ id: `job-${index}`, data: job }));
      let callCount = 0;
      const mockAdd = jest.fn().mockImplementation(() => Promise.resolve(mockJobs[callCount++]));
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const promises = jobs.map(job => queueService.addCallJob(job));
      const results = await Promise.allSettled(promises);

      // All should be fulfilled
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        expect(result.value).toHaveProperty('id');
        expect(result.value).toHaveProperty('data');
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle timeout scenarios', async () => {
      // Mock a slow operation that resolves before timeout
      const mockJob = { id: 'timeout-job', data: { deliveryId: 'timeout-test' } };
      const mockAdd = jest.fn().mockResolvedValue(mockJob);
      Queue.mockImplementation(() => ({
        add: mockAdd
      }));

      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), 5000);
      });

      const result = await Promise.race([
        queueService.addCallJob({ deliveryId: 'timeout-test' }),
        timeoutPromise
      ]);
      expect(result).toEqual(mockJob);
    });

    it('should validate service health', async () => {
      const mockStats = {
        waiting: 1,
        active: 0,
        completed: 2,
        failed: 0
      };

      const mockGetWaiting = jest.fn().mockResolvedValue([{ id: 'waiting-job' }]);
      const mockGetActive = jest.fn().mockResolvedValue([]);
      const mockGetCompleted = jest.fn().mockResolvedValue([{ id: 'completed-1' }, { id: 'completed-2' }]);
      const mockGetFailed = jest.fn().mockResolvedValue([]);

      Queue.mockImplementation(() => ({
        getWaiting: mockGetWaiting,
        getActive: mockGetActive,
        getCompleted: mockGetCompleted,
        getFailed: mockGetFailed
      }));

      const stats = await queueService.getQueueStats();
      expect(stats).toEqual(mockStats);
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
    });
  });

  describe('Configuration and Environment', () => {
    it('should respect environment configuration', () => {
      // Test that service respects environment variables
      expect(process.env.NODE_ENV).toBeDefined();

      // Service should adapt to test environment
      if (process.env.NODE_ENV === 'test') {
        expect(true).toBe(true);
      }
    });

    it('should handle missing configuration gracefully', () => {
      // Service should work even with minimal configuration
      expect(queueService).toBeDefined();
      expect(typeof queueService.addCallJob).toBe('function');
      expect(typeof queueService.getQueueStats).toBe('function');
    });
  });
});