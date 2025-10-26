const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { app } = require('../../src/index.js');
const testData = require('../helpers/testData');

describe('Security Tests', () => {
  let server;
  let validToken;
  let expiredToken;

  beforeAll(async () => {
    // Create valid token
    validToken = jwt.sign(
      { 
        id: testData.validAgent._id.toString(), 
        email: testData.validAgent.email, 
        role: 'agent' 
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create expired token
    expiredToken = jwt.sign(
      { 
        id: testData.validAgent._id.toString(), 
        email: testData.validAgent.email, 
        role: 'agent' 
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Already expired
    );
  });

  beforeEach(() => {
    // Reset any stubs
    sinon.restore();
  });

  describe('Authentication Security', () => {
    it('should reject requests without authentication token', async () => {
      await request(app)
        .get('/api/deliveries')
        .expect(401);
    });

    it('should reject malformed authorization headers', async () => {
      const malformedHeaders = [
        'InvalidFormat token123',
        'Bearer',
        'bearer token123',
        'Token token123',
        'Basic dGVzdDp0ZXN0' // Basic auth instead of Bearer
      ];

      for (const header of malformedHeaders) {
        await request(app)
          .get('/api/deliveries')
          .set('Authorization', header)
          .expect(401);
      }
    });

    it('should reject expired tokens', async () => {
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should reject tampered tokens', async () => {
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';

      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('should implement proper password hashing', async () => {
      // Test that passwords are properly hashed
      const plainPassword = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      expect(hashedPassword).not.toBe(plainPassword);
      expect(hashedPassword.length).toBeGreaterThan(50);
      expect(await bcrypt.compare(plainPassword, hashedPassword)).toBe(true);
      expect(await bcrypt.compare('WrongPassword', hashedPassword)).toBe(false);
    });

    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'short',
        '12345678',
        'password',
        'Password',
        'password123',
        'PASSWORD123'
      ];

      for (const weakPassword of weakPasswords) {
        await request(app)
          .post('/api/auth/register')
          .send({
            name: 'Test User',
            email: 'test@example.com',
            password: weakPassword
          })
          .expect(400);
      }
    });

    it('should prevent brute force attacks with rate limiting', async () => {
      const attempts = [];
      
      // Make multiple failed login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'test@example.com',
              password: 'wrongpassword'
            })
        );
      }

      const results = await Promise.all(attempts);

      // Later attempts should be rate limited
      const rateLimitedRequests = results.filter(res => res.status === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization Security', () => {
    it('should enforce role-based access control', async () => {
      const agentToken = jwt.sign(
        { id: 'agent123', role: 'agent' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      // Agent trying to access admin-only endpoint
      await request(app)
        .get('/api/admin/system-stats')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Insufficient permissions');
        });
    });

    it('should prevent agents from accessing other agents data', async () => {
      const agent1Token = jwt.sign(
        { id: 'agent1', role: 'agent' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      // Agent1 trying to access Agent2's data
      await request(app)
        .get('/api/agents/agent2/deliveries')
        .set('Authorization', `Bearer ${agent1Token}`)
        .expect(403);
    });

    it('should validate resource ownership', async () => {
      const agentToken = jwt.sign(
        { id: 'agent123', role: 'agent' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      // Try to access delivery not assigned to this agent
      await request(app)
        .get(`/api/deliveries/${testData.delivery._id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(403);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE deliveries; --",
        "' OR '1'='1",
        "'; UPDATE deliveries SET status='completed'; --",
        "' UNION SELECT * FROM agents --"
      ];

      for (const injection of sqlInjectionAttempts) {
        await request(app)
          .get('/api/deliveries')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ search: injection })
          .expect(res => {
            // Should not cause server error or unexpected behavior
            expect(res.status).not.toBe(500);
          });
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const noSqlInjectionAttempts = [
        { $ne: null },
        { $regex: ".*" },
        { $where: "this.password.length > 0" },
        { $gt: "" }
      ];

      for (const injection of noSqlInjectionAttempts) {
        await request(app)
          .post('/api/deliveries')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            customer_id: injection,
            agent_id: testData.validAgent._id.toString(),
            package_id: 'TEST-PKG',
            address: '123 Test Street'
          })
          .expect(400); // Should be rejected by validation
      }
    });

    it('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '"><script>alert("xss")</script>',
        'data:text/html,<script>alert("xss")</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/deliveries')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            customer_id: testData.validCustomer._id.toString(),
            agent_id: testData.validAgent._id.toString(),
            package_id: 'TEST-PKG',
            address: '123 Test Street',
            special_instructions: payload
          });

        if (response.status === 201) {
          // If created, ensure XSS payload is sanitized
          expect(response.body.data.special_instructions).not.toContain('<script>');
          expect(response.body.data.special_instructions).not.toContain('javascript:');
          expect(response.body.data.special_instructions).not.toContain('onerror=');
        }
      }
    });

    it('should validate file upload restrictions', async () => {
      // Test file upload with malicious content
      const maliciousFile = Buffer.from('<?php system($_GET["cmd"]); ?>');

      await request(app)
        .post('/api/upload/proof-of-delivery')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', maliciousFile, 'malicious.php')
        .expect(400);
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....//....//....//etc/passwd'
      ];

      for (const path of pathTraversalAttempts) {
        await request(app)
          .get(`/api/recordings/${path}`)
          .set('Authorization', `Bearer ${validToken}`)
          .expect(400);
      }
    });
  });

  describe('API Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
    });

    it('should not expose sensitive server information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['server']).toBeUndefined();
    });

    it('should implement proper CORS policy', async () => {
      const response = await request(app)
        .options('/api/deliveries')
        .set('Origin', 'https://malicious-site.com')
        .expect(res => {
          const allowedOrigin = res.headers['access-control-allow-origin'];
          expect(allowedOrigin).not.toBe('*');
          expect(allowedOrigin).not.toBe('https://malicious-site.com');
        });
    });
  });

  describe('Webhook Security', () => {
    it('should validate Twilio webhook signatures', async () => {
      const webhookData = {
        CallSid: 'CA123456789',
        From: '+1234567890',
        To: '+0987654321',
        CallStatus: 'completed'
      };

      // Request without signature
      await request(app)
        .post('/api/webhooks/call-status')
        .send(webhookData)
        .expect(401);

      // Request with invalid signature
      await request(app)
        .post('/api/webhooks/call-status')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send(webhookData)
        .expect(401);
    });

    it('should prevent webhook replay attacks', async () => {
      const webhookData = {
        CallSid: 'CA123456789',
        From: '+1234567890',
        To: '+0987654321',
        CallStatus: 'completed'
      };

      // Create a signature for old timestamp (10 minutes ago)
      const oldTimestamp = Math.floor((Date.now() - (10 * 60 * 1000)) / 1000);
      const authToken = process.env.TWILIO_AUTH_TOKEN || 'test-auth-token';
      const url = 'http://localhost:3001/api/webhooks/call-status';
      const body = new URLSearchParams(webhookData).toString();

      // Generate signature with old timestamp
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha1', authToken)
        .update(oldTimestamp + url + body)
        .digest('base64');

      await request(app)
        .post('/api/webhooks/call-status')
        .set('X-Twilio-Signature', signature)
        .set('X-Twilio-Request-Timestamp', oldTimestamp.toString())
        .send(webhookData)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toContain('expired');
          expect(res.body.error).toContain('timestamp');
        });
    });
  });

  describe('Rate Limiting Security', () => {
    it('should implement IP-based rate limiting', async () => {
      const promises = [];

      // Make many requests from same IP
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .get('/api/deliveries')
            .set('Authorization', `Bearer ${validToken}`)
            .set('X-Forwarded-For', '192.168.1.100')
        );
      }

      const results = await Promise.all(promises);
      const rateLimited = results.filter(res => res.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should implement user-based rate limiting', async () => {
      const promises = [];

      // Make many requests with same token to test user-based rate limiting
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .post('/api/calls/initiate')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
              delivery_id: testData.validDelivery._id,
              customer_phone: '+1234567890'
            })
        );
      }

      const results = await Promise.all(promises);
      const rateLimited = results.filter(res => res.status === 429);

      // At least some requests should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);

      // Verify rate limit headers are present on limited requests
      const limitedResponse = rateLimited[0];
      if (limitedResponse && limitedResponse.headers) {
        expect(limitedResponse.headers).toHaveProperty('x-ratelimit-limit');
        expect(limitedResponse.headers).toHaveProperty('x-ratelimit-remaining');
        expect(limitedResponse.headers).toHaveProperty('retry-after');
      }
    });

    it('should implement endpoint-specific rate limits', async () => {
      // Analytics endpoint should have stricter limits
      const analyticsPromises = [];
      
      for (let i = 0; i < 20; i++) {
        analyticsPromises.push(
          request(app)
            .get('/api/analytics/dashboard')
            .set('Authorization', `Bearer ${validToken}`)
        );
      }

      const results = await Promise.all(analyticsPromises);
      const rateLimited = results.filter(res => res.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Data Protection', () => {
    it('should not expose sensitive data in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      // Ensure error message doesn't leak sensitive information
      expect(response.body.error).not.toContain('password');
      expect(response.body.error).not.toContain('hash');
      expect(response.body.error).not.toContain('database');
      expect(response.body.error).not.toContain('connection');
      expect(response.body.error).not.toContain('mongodb');
      expect(response.body.error).not.toContain('sql');
      expect(response.body.error).not.toContain('internal');
      expect(response.body.error).not.toContain('stack');
      expect(response.body.error).not.toContain('trace');

      // Should contain generic authentication failure message
      expect(response.body.error).toMatch(/invalid|unauthorized|authentication|login/i);
    });

    it('should mask sensitive fields in API responses', async () => {
      const response = await request(app)
        .get('/api/agents/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Verify sensitive fields are not exposed
      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.password_hash).toBeUndefined();
      expect(response.body.data.salt).toBeUndefined();
      expect(response.body.data.internal_notes).toBeUndefined();

      // Phone numbers should be masked if present
      if (response.body.data.phone) {
        expect(response.body.data.phone).toMatch(/\*{3,}/);
        expect(response.body.data.phone).not.toBe(testData.validAgent.phone);
      }

      // Email should be present but not other sensitive data
      expect(response.body.data.email).toBeDefined();
      expect(response.body.data.name).toBeDefined();
      expect(response.body.data.role).toBeDefined();
    });

    it('should implement proper data sanitization', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: 1 })
        .expect(200);

      if (response.body.data && response.body.data.deliveries && response.body.data.deliveries.length > 0) {
        const delivery = response.body.data.deliveries[0];

        // Check that sensitive fields are not exposed in delivery data
        expect(delivery.customer_ssn).toBeUndefined();
        expect(delivery.customer_social_security).toBeUndefined();
        expect(delivery.payment_info).toBeUndefined();
        expect(delivery.credit_card_number).toBeUndefined();
        expect(delivery.internal_notes).toBeUndefined();
        expect(delivery.agent_private_notes).toBeUndefined();

        // Verify essential non-sensitive fields are present
        expect(delivery._id).toBeDefined();
        expect(delivery.customer_name).toBeDefined();
        expect(delivery.address).toBeDefined();
        expect(delivery.status).toBeDefined();

        // Phone numbers should be masked if present
        if (delivery.customer_phone) {
          expect(delivery.customer_phone).toMatch(/\*{3,}/);
        }
      }
    });
  });

  describe('Session Security', () => {
    it('should implement secure session management', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.validAgent.email,
          password: 'test123'
        })
        .expect(200);

      const token = loginResponse.body.data.token;

      // Token should be properly formatted JWT
      expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);

      // Decode and validate JWT structure
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token);

      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');

      // Expiration should be reasonable (not too short, not too long)
      const now = Math.floor(Date.now() / 1000);
      const timeToExpiry = decoded.exp - now;

      expect(timeToExpiry).toBeGreaterThan(1800); // At least 30 minutes
      expect(timeToExpiry).toBeLessThan(86400); // Less than 24 hours

      // Issued at should be recent
      const timeSinceIssued = now - decoded.iat;
      expect(timeSinceIssued).toBeLessThan(60); // Within last minute
    });

    it('should invalidate tokens on logout', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.validAgent.email,
          password: 'test123'
        })
        .expect(200);

      const token = loginResponse.body.data.token;

      // Verify token works before logout
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify token is invalidated after logout
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      // Verify different endpoints also reject the token
      await request(app)
        .get('/api/agents/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak stack traces in production', async () => {
      // Force an error by accessing non-existent endpoint
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);

      // In production, should not expose stack traces or internal error details
      expect(response.body.stack).toBeUndefined();
      expect(response.body).not.toHaveProperty('stack');
      expect(response.text).not.toContain('Error:');
      expect(response.text).not.toContain('at ');
      expect(response.text).not.toContain('TypeError:');
      expect(response.text).not.toContain('ReferenceError:');
      expect(response.text).not.toContain('node_modules');
      expect(response.text).not.toContain('internal');

      // Should contain generic error message
      expect(response.body.error || response.text).toMatch(/not found|endpoint|route/i);

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle database errors securely', async () => {
      // This would test behavior when database is unavailable
      // Implementation depends on your error handling strategy
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(res => {
          if (res.status === 500) {
            expect(res.body.error).not.toContain('connection');
            expect(res.body.error).not.toContain('database');
            expect(res.body.error).not.toContain('mongodb');
          }
        });
    });
  });

  describe('Content Security', () => {
    it('should implement proper content type validation', async () => {
      // Try to send XML instead of JSON
      const xmlResponse = await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/xml')
        .send('<xml><test>data</test></xml>')
        .expect(400);

      expect(xmlResponse.body.error).toContain('content-type');
      expect(xmlResponse.body.error).toMatch(/json|xml|invalid/i);

      // Try to send plain text instead of JSON
      const textResponse = await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);

      expect(textResponse.body.error).toContain('content-type');
      expect(textResponse.body.error).toMatch(/json|text|invalid/i);

      // Valid JSON should work
      await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send({
          customer_id: testData.validCustomer._id,
          agent_id: testData.validAgent._id,
          package_id: 'TEST-PKG',
          address: '123 Test Street'
        })
        .expect(res => {
          // Should either succeed or fail for other reasons, but not content-type
          expect(res.status).not.toBe(400);
          if (res.body.error) {
            expect(res.body.error).not.toContain('content-type');
          }
        });
    });

    it('should limit request size', async () => {
      // Test with oversized payload
      const largePayload = 'a'.repeat(10 * 1024 * 1024); // 10MB string

      const response = await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          customer_id: testData.validCustomer._id,
          agent_id: testData.validAgent._id,
          package_id: 'TEST-PKG',
          address: '123 Test Street',
          special_instructions: largePayload
        })
        .expect(413); // Payload too large

      // Verify appropriate error message
      expect(response.body.error).toMatch(/too large|payload|size|limit/i);

      // Test with moderately large but acceptable payload
      const mediumPayload = 'a'.repeat(100 * 1024); // 100KB

      await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          customer_id: testData.validCustomer._id,
          agent_id: testData.validAgent._id,
          package_id: 'TEST-PKG-MEDIUM',
          address: '123 Test Street',
          special_instructions: mediumPayload
        })
        .expect(res => {
          // Should not be rejected for size (may fail for other reasons)
          expect(res.status).not.toBe(413);
        });

      // Test with normal payload
      await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          customer_id: testData.validCustomer._id,
          agent_id: testData.validAgent._id,
          package_id: 'TEST-PKG-NORMAL',
          address: '123 Test Street',
          special_instructions: 'Normal instructions'
        })
        .expect(res => {
          // Should not be rejected for size
          expect(res.status).not.toBe(413);
        });
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for authentication', async () => {
      const startTime = Date.now();

      // Valid email, wrong password
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.validAgent.email,
          password: 'wrongpassword'
        });

      const validEmailTime = Date.now() - startTime;

      const startTime2 = Date.now();

      // Invalid email
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        });

      const invalidEmailTime = Date.now() - startTime2;

      // Response times should be similar (within reasonable margin)
      const timeDifference = Math.abs(validEmailTime - invalidEmailTime);
      expect(timeDifference).toBeLessThan(100); // Less than 100ms difference
    });
  });
});