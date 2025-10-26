const autocannon = require('autocannon');
const request = require('supertest');
const { app } = require('../../src/index.js');
const testData = require('../helpers/testData');
const jwt = require('jsonwebtoken');

describe('Performance Load Tests', () => {
  let server;
  let authToken;

  beforeAll(async () => {
    // Use the actual app for testing
    server = app.listen(0); // Use random available port

    // Generate valid auth token
    authToken = jwt.sign(
      {
        id: testData.validAgent._id,
        email: testData.validAgent.email,
        role: 'agent'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('API endpoint performance', () => {
    it('should handle high load on delivery listing endpoint', async () => {
      const { port } = server.address();

      const result = await autocannon({
        url: `http://localhost:${port}/api/deliveries`,
        connections: 50,
        duration: 10, // 10 seconds
        headers: {
          'authorization': `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        requests: [
          {
            method: 'GET',
            path: '/api/deliveries?page=1&limit=20'
          }
        ]
      });

      expect(result.errors).toBe(0);
      expect(result.non2xx).toBe(0);
      expect(result.requests.average).toBeGreaterThan(100); // At least 100 req/sec
      expect(result.latency.p99).toBeLessThan(1000); // 99th percentile under 1 second
    }, 30000);

    it('should handle concurrent call initiations', async () => {
      const { port } = server.address();

      const callData = {
        delivery_id: testData.delivery._id.toString(),
        customer_phone: '+1234567890',
        scheduled_time: new Date().toISOString()
      };

      const result = await autocannon({
        url: `http://localhost:${port}/api/calls/initiate`,
        connections: 20,
        duration: 5,
        headers: {
          'authorization': `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        requests: [
          {
            method: 'POST',
            path: '/api/calls/initiate',
            body: JSON.stringify(callData)
          }
        ]
      });

      expect(result.errors).toBe(0);
      expect(result.latency.p95).toBeLessThan(2000); // 95th percentile under 2 seconds
    }, 20000);

    it('should handle webhook bursts efficiently', async () => {
      const { port } = server.address();

      const webhookData = {
        CallSid: 'CA123456789',
        CallStatus: 'completed',
        CallDuration: '45',
        From: '+1234567890',
        To: '+0987654321'
      };

      const result = await autocannon({
        url: `http://localhost:${port}/api/webhooks/call-status`,
        connections: 100, // High concurrency for webhook bursts
        duration: 5,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': 'test-signature'
        },
        requests: [
          {
            method: 'POST',
            path: '/api/webhooks/call-status',
            body: new URLSearchParams(webhookData).toString()
          }
        ]
      });

      expect(result.latency.p99).toBeLessThan(500); // Very fast webhook processing
      expect(result.throughput.average).toBeGreaterThan(1000000); // High throughput
    }, 20000);
  });

  describe('database performance', () => {
    it('should perform efficient database queries under load', async () => {
      const startTime = Date.now();

      // Simulate concurrent database operations
      const promises = Array.from({ length: 50 }, async (_, i) => {
        return request(server)
          .get('/api/deliveries')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: Math.floor(i / 10) + 1,
            limit: 10,
            sort: '-created_at'
          });
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All requests should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 50 concurrent queries
    });

    it('should handle complex analytics queries efficiently', async () => {
      const startTime = Date.now();

      const analyticsPromises = Array.from({ length: 10 }, () => {
        return request(server)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            start_date: '2024-01-01T00:00:00Z',
            end_date: '2024-01-31T23:59:59Z',
            group_by: 'day'
          });
      });

      const results = await Promise.all(analyticsPromises);
      const duration = Date.now() - startTime;

      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });

      // Analytics queries should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds for complex analytics
    });
  });

  describe('memory and resource usage', () => {
    it('should maintain stable memory usage under sustained load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Run sustained load test
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(server)
            .get('/api/deliveries')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      await Promise.all(promises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      
      // Memory growth should be reasonable (less than 50MB)
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    it('should handle CPU-intensive operations without blocking', async () => {
      const startTime = Date.now();
      
      // Start CPU-intensive analytics calculation
      const analyticsPromise = request(server)
        .get('/api/analytics/ai/generate-insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          delivery_ids: Array.from({ length: 100 }, (_, i) =>
            testData.delivery._id.toString()
          )
        });

      // Simultaneously make quick API calls
      const quickPromises = Array.from({ length: 10 }, () => {
        return request(server)
          .get('/health')
          .expect(200);
      });

      const [analyticsResult, ...quickResults] = await Promise.all([
        analyticsPromise,
        ...quickPromises
      ]);

      const duration = Date.now() - startTime;

      // Quick API calls should not be significantly delayed
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      quickResults.forEach(result => {
        expect(result.status).toBe(200);
      });
    });
  });

  describe('concurrent user scenarios', () => {
    it('should handle multiple agents accessing deliveries simultaneously', async () => {
      // Create multiple auth tokens for different agents
      const agentTokens = await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          const response = await request(app)
            .post('/api/auth/login')
            .send({
              email: `agent${i}@test.com`,
              password: 'test123'
            });
          return response.body.data.token;
        })
      );

      const startTime = Date.now();

      // Each agent makes multiple requests
      const promises = agentTokens.flatMap(token =>
        Array.from({ length: 5 }, () =>
          request(server)
            .get('/api/deliveries')
            .set('Authorization', `Bearer ${token}`)
            .query({ limit: 10 })
        )
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All requests should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      // Should handle 50 concurrent requests efficiently
      expect(duration).toBeLessThan(8000); // 8 seconds
    });

    it('should handle mixed read/write operations efficiently', async () => {
      const startTime = Date.now();

      const readPromises = Array.from({ length: 30 }, () =>
        request(server)
          .get('/api/deliveries')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const writePromises = Array.from({ length: 10 }, (_, i) =>
        request(server)
          .post('/api/deliveries')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            customer_id: testData.validCustomer._id,
            agent_id: testData.validAgent._id,
            package_id: `PERF-PKG-${i}`,
            address: `${i} Performance Test Street`,
            scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          })
      );

      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        request(server)
          .put(`/api/deliveries/${testData.delivery._id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            status: 'in_progress',
            notes: `Performance update ${i}`
          })
      );

      const results = await Promise.all([
        ...readPromises,
        ...writePromises,
        ...updatePromises
      ]);

      const duration = Date.now() - startTime;

      // Check success rates
      const successCount = results.filter(r => r.status >= 200 && r.status < 300).length;
      const successRate = (successCount / results.length) * 100;

      expect(successRate).toBeGreaterThan(95); // 95% success rate
      expect(duration).toBeLessThan(10000); // 10 seconds for mixed operations
    });
  });

  describe('stress testing', () => {
    it('should gracefully handle overload conditions', async () => {
      const { port } = server.address();

      const result = await autocannon({
        url: `http://localhost:${port}/api/deliveries`,
        connections: 200, // Very high concurrency
        duration: 10,
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      // Should not have too many errors even under stress
      const errorRate = (result.non2xx / result.requests.total) * 100;
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate

      // Should maintain reasonable response times
      expect(result.latency.p50).toBeLessThan(2000); // Median under 2 seconds
    }, 30000);

    it('should recover from temporary overload', async () => {
      // Create heavy load
      const heavyLoadPromise = autocannon({
        url: `http://localhost:${server.address().port}/api/deliveries`,
        connections: 150,
        duration: 5,
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      // Wait for load to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test if system is still responsive after heavy load starts
      const testRequest = await request(server)
        .get('/health')
        .timeout(5000);

      expect(testRequest.status).toBe(200);

      // Wait for load test to complete
      const loadResult = await heavyLoadPromise;

      // System should recover and be responsive again
      const recoveryRequest = await request(server)
        .get('/health');

      expect(recoveryRequest.status).toBe(200);
      expect(recoveryRequest.body.status).toBe('healthy');
    }, 20000);
  });

  describe('real-world scenarios', () => {
    it('should handle peak delivery creation periods', async () => {
      // Simulate peak hours with burst of delivery creations
      const deliveryPromises = Array.from({ length: 50 }, (_, i) =>
        request(server)
          .post('/api/deliveries')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            customer_id: testData.validCustomer._id,
            agent_id: testData.validAgent._id,
            package_id: `PEAK-PKG-${i}`,
            address: `${i} Peak Hour Street`,
            scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            priority: i % 4 === 0 ? 'urgent' : 'normal'
          })
      );

      const startTime = Date.now();
      const results = await Promise.all(deliveryPromises);
      const duration = Date.now() - startTime;

      // All deliveries should be created successfully
      const successCount = results.filter(r => r.status === 201).length;
      expect(successCount).toBeGreaterThan(45); // 90% success rate

      // Should complete within reasonable time
      expect(duration).toBeLessThan(15000); // 15 seconds
    });

    it('should handle analytics dashboard refresh during busy periods', async () => {
      // Simulate multiple users refreshing dashboards
      const dashboardPromises = Array.from({ length: 20 }, () =>
        request(server)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            refresh: true,
            start_date: '2024-01-01T00:00:00Z',
            end_date: new Date().toISOString()
          })
      );

      const startTime = Date.now();
      const results = await Promise.all(dashboardPromises);
      const duration = Date.now() - startTime;

      // All dashboard requests should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
      });

      // Dashboard should be responsive even with cache misses
      expect(duration).toBeLessThan(20000); // 20 seconds for all dashboards
    });
  });

  describe('resource cleanup', () => {
    it('should properly clean up resources after high load', async () => {
      // Get initial resource counts
      const initialStats = await request(server)
        .get('/api/admin/system-stats')
        .set('Authorization', `Bearer ${authToken}`);

      // Generate high load
      await autocannon({
        url: `http://localhost:${server.address().port}/api/deliveries`,
        connections: 100,
        duration: 5,
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check final resource counts
      const finalStats = await request(server)
        .get('/api/admin/system-stats')
        .set('Authorization', `Bearer ${authToken}`);

      // Connection counts should return to baseline
      const initialConnections = initialStats.body.data.database.connections;
      const finalConnections = finalStats.body.data.database.connections;
      
      expect(Math.abs(finalConnections - initialConnections)).toBeLessThan(10);
    });
  });
});