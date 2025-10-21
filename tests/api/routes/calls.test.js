// WORKING CALLS API TESTS - Based on actual implementation
const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../../src/services/queueService');
jest.mock('../../../src/database/models/Delivery');
jest.mock('../../../src/database/models/CallLog');

const { addCallJob } = require('../../../src/services/queueService');
const Delivery = require('../../../src/database/models/Delivery');
const CallLog = require('../../../src/database/models/CallLog');
const callsRouter = require('../../../src/api/routes/calls');

describe('Calls API Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/calls', callsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/calls/initiate', () => {
    const mockDelivery = {
      _id: '507f1f77bcf86cd799439011',
      customer_name: 'John Doe',
      customer_phone: '+15555551234',
      address: '123 Main Street'
    };

    const mockJob = {
      id: 'job_12345',
      data: { deliveryId: mockDelivery._id }
    };

    it('should initiate call successfully', async () => {
      Delivery.findById.mockResolvedValue(mockDelivery);
      addCallJob.mockResolvedValue(mockJob);

      const response = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: mockDelivery._id
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Call job queued successfully',
        job_id: mockJob.id,
        status: 'queued'
      });

      expect(Delivery.findById).toHaveBeenCalledWith(mockDelivery._id);
      expect(addCallJob).toHaveBeenCalledWith({ deliveryId: mockDelivery._id }, 0);
    });

    it('should initiate call with delay', async () => {
      Delivery.findById.mockResolvedValue(mockDelivery);
      addCallJob.mockResolvedValue(mockJob);

      const delay = 60000; // 1 minute
      const response = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: mockDelivery._id,
          delay: delay
        });

      expect(response.status).toBe(200);
      expect(addCallJob).toHaveBeenCalledWith({ deliveryId: mockDelivery._id }, delay);
    });

    it('should return 400 when delivery_id is missing', async () => {
      const response = await request(app)
        .post('/api/calls/initiate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'delivery_id is required'
      });

      expect(Delivery.findById).not.toHaveBeenCalled();
      expect(addCallJob).not.toHaveBeenCalled();
    });

    it('should return 404 when delivery not found', async () => {
      Delivery.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: 'nonexistent_id'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Delivery not found'
      });

      expect(Delivery.findById).toHaveBeenCalledWith('nonexistent_id');
      expect(addCallJob).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      Delivery.findById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: mockDelivery._id
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Internal server error'
      });
    });

    it('should handle queue service errors', async () => {
      Delivery.findById.mockResolvedValue(mockDelivery);
      addCallJob.mockRejectedValue(new Error('Queue service error'));

      const response = await request(app)
        .post('/api/calls/initiate')
        .send({
          delivery_id: mockDelivery._id
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Internal server error'
      });
    });
  });

  describe('GET /api/calls/:delivery_id', () => {
    const deliveryId = '507f1f77bcf86cd799439011';
    const mockCallLogs = [
      {
        _id: 'log1',
        delivery_id: deliveryId,
        call_sid: 'CA123456789',
        status: 'completed',
        createdAt: new Date('2024-01-02')
      },
      {
        _id: 'log2',
        delivery_id: deliveryId,
        call_sid: 'CA987654321',
        status: 'no-answer',
        createdAt: new Date('2024-01-01')
      }
    ];

    it('should get call logs for delivery', async () => {
      const mockFind = {
        sort: jest.fn().mockResolvedValue(mockCallLogs)
      };
      CallLog.find.mockReturnValue(mockFind);

      const response = await request(app)
        .get(`/api/calls/${deliveryId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCallLogs);

      expect(CallLog.find).toHaveBeenCalledWith({ delivery_id: deliveryId });
      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should return empty array when no call logs exist', async () => {
      const mockFind = {
        sort: jest.fn().mockResolvedValue([])
      };
      CallLog.find.mockReturnValue(mockFind);

      const response = await request(app)
        .get(`/api/calls/${deliveryId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should handle database errors', async () => {
      const mockFind = {
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      };
      CallLog.find.mockReturnValue(mockFind);

      const response = await request(app)
        .get(`/api/calls/${deliveryId}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Internal server error'
      });
    });

    it('should handle different delivery IDs', async () => {
      const differentDeliveryId = '507f1f77bcf86cd799439022';
      const mockFind = {
        sort: jest.fn().mockResolvedValue([])
      };
      CallLog.find.mockReturnValue(mockFind);

      const response = await request(app)
        .get(`/api/calls/${differentDeliveryId}`);

      expect(response.status).toBe(200);
      expect(CallLog.find).toHaveBeenCalledWith({ delivery_id: differentDeliveryId });
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/calls/initiate')
        .send('malformed json')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/calls/initiate')
        .send();

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'delivery_id is required'
      });
    });
  });

  describe('Route parameters', () => {
    it('should extract delivery_id from URL params correctly', async () => {
      const testDeliveryId = 'test_delivery_123';
      const mockFind = {
        sort: jest.fn().mockResolvedValue([])
      };
      CallLog.find.mockReturnValue(mockFind);

      await request(app).get(`/api/calls/${testDeliveryId}`);

      expect(CallLog.find).toHaveBeenCalledWith({ delivery_id: testDeliveryId });
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation!