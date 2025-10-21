const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const deliveryRoutes = require('../../../src/api/routes/deliveries');
const Delivery = require('../../../src/database/models/Delivery');

// Mock the Delivery model
jest.mock('../../../src/database/models/Delivery');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/deliveries', deliveryRoutes);

describe('Deliveries API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/deliveries', () => {
    it('should return empty array when no deliveries exist', async () => {
      // Mock Delivery.find to return empty array
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue([])
          })
        })
      });
      Delivery.find.mockImplementation(mockFind);

      const response = await request(app)
        .get('/api/deliveries')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
      expect(Delivery.find).toHaveBeenCalled();
    });

    it('should return all deliveries', async () => {
      const mockDeliveries = [
        {
          _id: new mongoose.Types.ObjectId(),
          address: '123 Test Street',
          scheduled_time: new Date(),
          customer_id: new mongoose.Types.ObjectId(),
          status: 'scheduled'
        }
      ];

      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue(mockDeliveries)
          })
        })
      });
      Delivery.find.mockImplementation(mockFind);

      const response = await request(app)
        .get('/api/deliveries')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].address).toBe('123 Test Street');
    });

    it('should handle database errors', async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });
      Delivery.find.mockImplementation(mockFind);

      const response = await request(app)
        .get('/api/deliveries')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('POST /api/deliveries', () => {
    it('should create a new delivery', async () => {
      const newDeliveryData = {
        customer_id: new mongoose.Types.ObjectId().toString(),
        address: '456 New Street',
        scheduled_time: new Date().toISOString()
      };

      const mockDelivery = {
        _id: new mongoose.Types.ObjectId(),
        ...newDeliveryData,
        save: jest.fn().mockResolvedValue(true),
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            execPopulate: jest.fn().mockResolvedValue({
              _id: new mongoose.Types.ObjectId(),
              ...newDeliveryData,
              status: 'scheduled'
            })
          })
        })
      };

      // Mock the constructor
      Delivery.mockImplementation(() => mockDelivery);

      const response = await request(app)
        .post('/api/deliveries')
        .send(newDeliveryData)
        .expect(201);

      expect(response.body.address).toBe(newDeliveryData.address);
      expect(mockDelivery.save).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      const mockDelivery = {
        save: jest.fn().mockRejectedValue(new Error('Validation error')),
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            execPopulate: jest.fn()
          })
        })
      };

      Delivery.mockImplementation(() => mockDelivery);

      const response = await request(app)
        .post('/api/deliveries')
        .send({
          customer_id: new mongoose.Types.ObjectId().toString(),
          address: '456 New Street',
          scheduled_time: new Date().toISOString()
        })
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/deliveries/:id', () => {
    it('should return a delivery by ID', async () => {
      const deliveryId = new mongoose.Types.ObjectId();
      const mockDelivery = {
        _id: deliveryId,
        address: '789 Test Avenue',
        customer_id: new mongoose.Types.ObjectId(),
        status: 'scheduled'
      };

      const mockFindById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockDelivery)
        })
      });
      Delivery.findById.mockImplementation(mockFindById);

      const response = await request(app)
        .get(`/api/deliveries/${deliveryId}`)
        .expect(200);

      expect(response.body._id).toBe(deliveryId.toString());
      expect(response.body.address).toBe('789 Test Avenue');
      expect(Delivery.findById).toHaveBeenCalledWith(deliveryId.toString());
    });

    it('should return 404 for non-existent delivery', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const mockFindById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });
      Delivery.findById.mockImplementation(mockFindById);

      const response = await request(app)
        .get(`/api/deliveries/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Delivery not found');
    });
  });

  describe('PUT /api/deliveries/:id', () => {
    it('should update a delivery', async () => {
      const deliveryId = new mongoose.Types.ObjectId();
      const updatedData = {
        address: '202 Updated Street',
        status: 'completed'
      };

      const mockUpdatedDelivery = {
        _id: deliveryId,
        ...updatedData,
        customer_id: new mongoose.Types.ObjectId()
      };

      const mockFindByIdAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockUpdatedDelivery)
        })
      });
      Delivery.findByIdAndUpdate.mockImplementation(mockFindByIdAndUpdate);

      const response = await request(app)
        .put(`/api/deliveries/${deliveryId}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.address).toBe(updatedData.address);
      expect(response.body.status).toBe(updatedData.status);
      expect(Delivery.findByIdAndUpdate).toHaveBeenCalledWith(
        deliveryId.toString(),
        expect.objectContaining(updatedData),
        { new: true, runValidators: true }
      );
    });

    it('should return 404 for non-existent delivery', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const mockFindByIdAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });
      Delivery.findByIdAndUpdate.mockImplementation(mockFindByIdAndUpdate);

      const response = await request(app)
        .put(`/api/deliveries/${fakeId}`)
        .send({ address: 'Updated Address' })
        .expect(404);

      expect(response.body.error).toBe('Delivery not found');
    });
  });

  describe('DELETE /api/deliveries/:id', () => {
    it('should delete a delivery', async () => {
      const deliveryId = new mongoose.Types.ObjectId();
      const mockDeletedDelivery = {
        _id: deliveryId,
        address: '303 Delete Street'
      };

      Delivery.findByIdAndDelete.mockResolvedValue(mockDeletedDelivery);

      const response = await request(app)
        .delete(`/api/deliveries/${deliveryId}`)
        .expect(200);

      expect(response.body.message).toBe('Delivery deleted successfully');
      expect(Delivery.findByIdAndDelete).toHaveBeenCalledWith(deliveryId.toString());
    });

    it('should return 404 for non-existent delivery', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      Delivery.findByIdAndDelete.mockResolvedValue(null);

      const response = await request(app)
        .delete(`/api/deliveries/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Delivery not found');
    });
  });
});