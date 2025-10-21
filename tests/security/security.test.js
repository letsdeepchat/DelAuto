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
        .expect(401)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Access token required');
        });
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
        .expect(401)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Token expired');
        });
    });

    it('should reject tampered tokens', async () => {
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';
      
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Invalid token');
        });
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
          .expect(400)
          .expect(res => {
            expect(res.body.success).toBe(false);
            expect(res.body.error).toContain('password');
          });
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
        .expect(403)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Access denied');
        });
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
        .expect(res => {
          if (res.status !== 400) {
            // If file was processed, ensure it's not executable
            expect(res.body.data.file_type).not.toBe('application/x-php');
            expect(res.body.data.filename).not.toContain('.php');
          }
        });
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
          .expect(res => {
            expect(res.status).toBeOneOf([400, 403, 404]);
            expect(res.body.error).not.toContain('etc/passwd');
          });
      }
    });
  });

  describe('API Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
      expect(response.headers).toHaveProperty('strict-transport-security');
      expect(response.headers).toHaveProperty('content-security-policy');
    });

    it('should not expose sensitive server information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
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
        .expect(401)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Missing webhook signature');
        });

      // Request with invalid signature
      await request(app)
        .post('/api/webhooks/call-status')
        .set('X-Twilio-Signature', 'invalid-signature')
        .send(webhookData)
        .expect(401)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Invalid webhook signature');
        });
    });

    it('should prevent webhook replay attacks', async () => {
      const webhookData = {
        CallSid: 'CA123456789',
        From: '+1234567890',
        To: '+0987654321',
        CallStatus: 'completed',
        timestamp: Date.now() - (10 * 60 * 1000) // 10 minutes old
      };

      await request(app)
        .post('/api/webhooks/call-status')
        .set('X-Twilio-Signature', 'valid-but-old-signature')
        .send(webhookData)
        .expect(400)
        .expect(res => {
          expect(res.body.error).toContain('expired');
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

      // Make many requests with same token
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .post('/api/calls/initiate')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
              delivery_id: testData.delivery._id.toString(),
              customer_phone: '+1234567890'
            })
        );
      }

      const results = await Promise.all(promises);
      const rateLimited = results.filter(res => res.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
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
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        })
        .expect(401)
        .expect(res => {
          expect(res.body.error).not.toContain('password');
          expect(res.body.error).not.toContain('hash');
          expect(res.body.error).not.toContain('database');
        });
    });

    it('should mask sensitive fields in API responses', async () => {
      const response = await request(app)
        .get('/api/agents/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Phone numbers should be masked
      if (response.body.data.phone) {
        expect(response.body.data.phone).toMatch(/\*{3,}/);
      }

      // Should not contain password hash
      expect(response.body.data.password).toBeUndefined();
      expect(response.body.data.password_hash).toBeUndefined();
    });

    it('should implement proper data sanitization', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: 1 })
        .expect(200);

      if (response.body.data.deliveries.length > 0) {
        const delivery = response.body.data.deliveries[0];
        
        // Check that sensitive fields are not exposed
        expect(delivery.customer_ssn).toBeUndefined();
        expect(delivery.payment_info).toBeUndefined();
        expect(delivery.internal_notes).toBeUndefined();
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
      
      // Should have reasonable expiration time
      const decoded = jwt.decode(token);
      const expirationTime = decoded.exp * 1000;
      const now = Date.now();
      const timeUntilExpiry = expirationTime - now;
      
      expect(timeUntilExpiry).toBeGreaterThan(30 * 60 * 1000); // At least 30 minutes
      expect(timeUntilExpiry).toBeLessThan(24 * 60 * 60 * 1000); // Less than 24 hours
    });

    it('should invalidate tokens on logout', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testData.validAgent.email,
          password: 'test123'
        });

      const token = loginResponse.body.data.token;

      // Use token successfully
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Token should no longer work
      await request(app)
        .get('/api/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak stack traces in production', async () => {
      // Force an error
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404)
        .expect(res => {
          expect(res.body.stack).toBeUndefined();
          expect(res.text).not.toContain('Error:');
          expect(res.text).not.toContain('at ');
        });

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
      await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/xml')
        .send('<xml><test>data</test></xml>')
        .expect(400);
    });

    it('should limit request size', async () => {
      const largePayload = 'a'.repeat(10 * 1024 * 1024); // 10MB

      await request(app)
        .post('/api/deliveries')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          customer_id: testData.validCustomer._id.toString(),
          agent_id: testData.validAgent._id.toString(),
          package_id: 'TEST-PKG',
          address: '123 Test Street',
          special_instructions: largePayload
        })
        .expect(413); // Payload too large
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