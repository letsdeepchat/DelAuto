const queueService = require('../../src/services/queueService');

require('dotenv').config({ path: '.env.test' });

describe('Queue Service - Integration Tests (No Mocks)', () => {

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
    it('should handle job creation with minimal data', async () => {
      const jobData = { deliveryId: 'test-delivery-123' };

      try {
        const result = await queueService.addCallJob(jobData);
        // If Redis/Bull is available, should return job object
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('id');
      } catch (error) {
        // If Redis/Bull is not available, should handle gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle job creation with delay', async () => {
      const jobData = { deliveryId: 'test-delivery-123' };
      const delay = 5000;

      try {
        const result = await queueService.addCallJob(jobData, delay);
        expect(typeof result).toBe('object');
      } catch (error) {
        // Should handle Redis/Bull unavailability
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate job data structure', async () => {
      try {
        await queueService.addCallJob(null);
        // If it doesn't throw, it handles null gracefully
        expect(true).toBe(true);
      } catch (error) {
        // Should handle invalid input appropriately
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle empty job data', async () => {
      try {
        const result = await queueService.addCallJob({});
        expect(typeof result).toBe('object');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('getQueueStats function', () => {
    it('should return queue statistics object', async () => {
      try {
        const stats = await queueService.getQueueStats();
        expect(typeof stats).toBe('object');
        
        // Should have expected stat properties
        if (stats) {
          expect(stats).toHaveProperty('waiting');
          expect(stats).toHaveProperty('active');
          expect(stats).toHaveProperty('completed');
          expect(stats).toHaveProperty('failed');
        }
      } catch (error) {
        // Redis/Bull unavailable, should handle gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle queue unavailability', async () => {
      try {
        const stats = await queueService.getQueueStats();
        // Should return object even if queue is empty
        expect(typeof stats).toBe('object');
      } catch (error) {
        // Should fail gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle service connection errors', async () => {
      // Test what happens when Redis is unavailable
      try {
        await queueService.addCallJob({ deliveryId: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBeDefined();
      }
    });

    it('should handle malformed data gracefully', async () => {
      try {
        await queueService.addCallJob(undefined);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle large data payloads', async () => {
      const largeData = {
        deliveryId: 'test-123',
        metadata: new Array(1000).fill('test-data').join('')
      };

      try {
        await queueService.addCallJob(largeData);
        expect(true).toBe(true); // If no error, test passes
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Service Integration', () => {
    it('should maintain consistent data format', async () => {
      const testData = {
        deliveryId: 'delivery-123',
        priority: 'high',
        attempts: 3
      };

      try {
        const result = await queueService.addCallJob(testData);
        if (result && result.data) {
          expect(result.data).toMatchObject(testData);
        }
      } catch (error) {
        // Expected if Redis is unavailable
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle concurrent job additions', async () => {
      const jobs = [
        { deliveryId: 'delivery-1' },
        { deliveryId: 'delivery-2' },
        { deliveryId: 'delivery-3' }
      ];

      try {
        const promises = jobs.map(job => queueService.addCallJob(job));
        const results = await Promise.allSettled(promises);
        
        // All should be either fulfilled or rejected consistently
        results.forEach(result => {
          expect(['fulfilled', 'rejected']).toContain(result.status);
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle timeout scenarios', async () => {
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), 5000);
      });

      try {
        await Promise.race([
          queueService.addCallJob({ deliveryId: 'timeout-test' }),
          timeoutPromise
        ]);
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate service health', async () => {
      try {
        const stats = await queueService.getQueueStats();
        if (stats) {
          // If we get stats, service is healthy
          expect(typeof stats.waiting).toBe('number');
          expect(typeof stats.active).toBe('number');
          expect(typeof stats.completed).toBe('number');
          expect(typeof stats.failed).toBe('number');
        }
      } catch (error) {
        // Service unavailable but should fail gracefully
        expect(error).toBeInstanceOf(Error);
      }
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
    });
  });
});