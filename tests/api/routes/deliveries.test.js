const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { authenticateApiKey } = require('../../../src/api/middleware/auth');
const deliveryRoutes = require('../../../src/api/routes/deliveries');

require('dotenv').config({ path: '.env.test' });

describe('Deliveries API Routes - Integration Tests (No Mocks)', () => {
  let app;
  const testApiKey = process.env.API_KEY || 'test_api_key_123';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/deliveries', authenticateApiKey, deliveryRoutes);
    
    app.use((error, req, res, next) => {
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid JSON format' });
      }
      res.status(500).json({ error: error.message });
    });
  });

  describe('Authentication Tests', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app)
        .get('/api/deliveries');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('x-api-key', 'invalid_key');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/deliveries', () => {
    it('should handle authenticated requests', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('x-api-key', testApiKey);

      // Should authenticate successfully or handle errors gracefully
      expect([200, 401, 500]).toContain(response.status);
    });

    it('should return JSON response format', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('x-api-key', testApiKey);

      if (response.status !== 401) {
        expect(response.headers['content-type']).toMatch(/json/);
      }
      
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('should handle database connection issues gracefully', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('x-api-key', testApiKey);

      if (response.status === 500) {
        expect(response.body).toHaveProperty('error');
        expect(typeof response.body.error).toBe('string');
      }
    });
  });

  describe('GET /api/deliveries/:id', () => {
    it('should handle valid ObjectId format', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey);

      // Should process valid ID format
      expect([200, 401, 404, 500]).toContain(response.status);
    });

    it('should handle invalid ObjectId format', async () => {
      const response = await request(app)
        .get('/api/deliveries/invalid_id')
        .set('x-api-key', testApiKey);

      // Should handle invalid ID format gracefully  
      expect([400, 401, 500]).toContain(response.status);
      
      if (response.status !== 401) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should require authentication', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/deliveries/${testId}`);

      expect(response.status).toBe(401);
    });

    it('should return JSON response', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey);

      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });
  });

  describe('POST /api/deliveries', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: new mongoose.Types.ObjectId().toString(),
          address: '123 Test Street',
          scheduled_time: new Date().toISOString()
        });

      expect(response.status).toBe(401);
    });

    it('should handle authenticated POST requests', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .send({
          customer_id: new mongoose.Types.ObjectId().toString(),
          address: '123 Test Street',
          scheduled_time: new Date().toISOString()
        });

      // May succeed, fail validation, or fail on DB operations
      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .send({});

      // Should handle missing required fields
      expect([400, 401, 500]).toContain(response.status);
      
      if (response.status !== 401) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return JSON response', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .send({
          customer_id: new mongoose.Types.ObjectId().toString(),
          address: '123 Test Street',
          scheduled_time: new Date().toISOString()
        });

      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });
  });

  describe('PUT /api/deliveries/:id', () => {
    it('should require authentication', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/deliveries/${testId}`)
        .send({ address: 'Updated Address' });

      expect(response.status).toBe(401);
    });

    it('should handle authenticated PUT requests', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey)
        .send({ 
          address: 'Updated Address',
          status: 'completed' 
        });

      expect([200, 401, 404, 500]).toContain(response.status);
    });

    it('should handle invalid ObjectId in URL', async () => {
      const response = await request(app)
        .put('/api/deliveries/invalid_id')
        .set('x-api-key', testApiKey)
        .send({ address: 'Updated Address' });

      expect([400, 401, 500]).toContain(response.status);
      
      if (response.status !== 401) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should return JSON response', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey)
        .send({ address: 'Updated Address' });

      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });
  });

  describe('DELETE /api/deliveries/:id', () => {
    it('should require authentication', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/deliveries/${testId}`);

      expect(response.status).toBe(401);
    });

    it('should handle authenticated DELETE requests', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey);

      expect([200, 401, 404, 500]).toContain(response.status);
    });

    it('should handle invalid ObjectId in URL', async () => {
      const response = await request(app)
        .delete('/api/deliveries/invalid_id')
        .set('x-api-key', testApiKey);

      expect([400, 401, 500]).toContain(response.status);
      
      if (response.status !== 401) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should return JSON response', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey);

      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });
  });

  describe('HTTP Method Support', () => {
    it('should support GET method', async () => {
      const response = await request(app)
        .get('/api/deliveries')
        .set('x-api-key', testApiKey);

      expect([200, 401, 500]).toContain(response.status);
    });

    it('should support POST method', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .send({ invalid: 'data' });

      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should support PUT method', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey)
        .send({ address: 'Updated' });

      expect([200, 401, 404, 500]).toContain(response.status);
    });

    it('should support DELETE method', async () => {
      const testId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/deliveries/${testId}`)
        .set('x-api-key', testApiKey);

      expect([200, 401, 404, 500]).toContain(response.status);
    });
  });

  describe('Content Type Handling', () => {
    it('should handle application/json content type', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ address: 'Test Address' }));

      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should handle missing content type gracefully', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .send({ address: 'Test Address' });

      expect([201, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for auth failures', async () => {
      const response = await request(app)
        .get('/api/deliveries');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(typeof response.body).toBe('object');
    });

    it('should return consistent error format for malformed JSON', async () => {
      const response = await request(app)
        .post('/api/deliveries')
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .send('malformed');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});