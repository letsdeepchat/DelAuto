const request = require('supertest');
const express = require('express');
const analyticsRouter = require('../../../src/api/routes/analytics');

// Create test app
const app = express();
app.use(express.json());

// Mock the services that the analytics router depends on
jest.mock('../../../src/services/analyticsService', () => ({
  getDashboardSummary: jest.fn(),
  getAgentAnalytics: jest.fn(),
  getDeliveryAnalytics: jest.fn(),
  getCallAnalytics: jest.fn(),
  getTimeSeriesData: jest.fn(),
  clearCache: jest.fn(),
}));

jest.mock('../../../src/services/aiService', () => ({
  processRecording: jest.fn(),
  getStatus: jest.fn(),
}));

jest.mock('../../../src/database/models/Delivery', () => ({
  find: jest.fn(),
}));

// Mock auth middleware to always allow access
jest.mock('../../../src/api/middleware/auth', () => ({
  authenticateJWT: (req, res, next) => {
    req.user = { id: 'admin-id', role: 'admin' };
    req.agent = { id: 'agent-id', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

jest.mock('../../../src/api/middleware/validation', () => ({
  validateQuery: () => (req, res, next) => next(),
  schemas: {
    pagination: {}
  }
}));

const analyticsService = require('../../../src/services/analyticsService');
const aiService = require('../../../src/services/aiService');
const Delivery = require('../../../src/database/models/Delivery');

app.use('/api/analytics', analyticsRouter);

describe('Analytics API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/dashboard', () => {
    it('should return dashboard summary', async () => {
      const mockSummary = {
        overview: {
          totalDeliveries: 100,
          totalCalls: 85,
          activeAgents: 5,
          completionRate: 85,
          callSuccessRate: 90
        },
        trends: [
          { date: '2024-01-01', deliveries: 10, calls: 8 }
        ]
      };

      analyticsService.getDashboardSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(analyticsService.getDashboardSummary).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      analyticsService.getDashboardSummary.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .expect(500);

      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/analytics/overview', () => {
    it('should return overview stats in legacy format', async () => {
      const mockSummary = {
        overview: {
          totalDeliveries: 100,
          totalCalls: 85,
          activeAgents: 5,
          completionRate: 85,
          callSuccessRate: 90
        }
      };

      analyticsService.getDashboardSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/analytics/overview')
        .expect(200);

      expect(response.body).toEqual({
        deliveries: {
          total: 100,
          completed: 85,
          successRate: 85
        },
        agents: {
          total: 5,
          active: 5
        },
        calls: {
          total: 85,
          successRate: 90
        }
      });
    });
  });

  describe('GET /api/analytics/agent-performance', () => {
    it('should return paginated agent performance data', async () => {
      const mockAgentStats = [
        { agentId: 'agent1', deliveriesCompleted: 50, successRate: 90 },
        { agentId: 'agent2', deliveriesCompleted: 45, successRate: 85 }
      ];

      analyticsService.getAgentAnalytics.mockResolvedValue(mockAgentStats);

      const response = await request(app)
        .get('/api/analytics/agent-performance')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toEqual({
        agents: mockAgentStats,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          pages: 1
        }
      });

      expect(analyticsService.getAgentAnalytics).toHaveBeenCalledWith({});
    });

    it('should apply date filters when provided', async () => {
      analyticsService.getAgentAnalytics.mockResolvedValue([]);

      await request(app)
        .get('/api/analytics/agent-performance')
        .query({ 
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(200);

      expect(analyticsService.getAgentAnalytics).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });
    });
  });

  describe('GET /api/analytics/delivery-status', () => {
    it('should return delivery status breakdown', async () => {
      const mockAnalytics = {
        totalDeliveries: 100,
        completedDeliveries: 85,
        failedDeliveries: 10,
        pendingDeliveries: 5,
        inTransitDeliveries: 0,
        completionRate: 85,
        failureRate: 10
      };

      analyticsService.getDeliveryAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/analytics/delivery-status')
        .expect(200);

      expect(response.body).toEqual({
        total: 100,
        completed: 85,
        failed: 10,
        pending: 5,
        inTransit: 0,
        completionRate: 85,
        failureRate: 10
      });
    });
  });

  describe('GET /api/analytics/deliveries', () => {
    it('should return detailed delivery analytics', async () => {
      const mockAnalytics = {
        totalDeliveries: 100,
        completionRate: 85,
        trends: []
      };

      analyticsService.getDeliveryAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/analytics/deliveries')
        .expect(200);

      expect(response.body).toEqual(mockAnalytics);
      expect(analyticsService.getDeliveryAnalytics).toHaveBeenCalledWith({});
    });

    it('should apply filters when provided', async () => {
      analyticsService.getDeliveryAnalytics.mockResolvedValue({});

      await request(app)
        .get('/api/analytics/deliveries')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          agentId: 'agent123',
          status: 'completed'
        })
        .expect(200);

      expect(analyticsService.getDeliveryAnalytics).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        agentId: 'agent123',
        status: 'completed'
      });
    });
  });

  describe('GET /api/analytics/calls', () => {
    it('should return call analytics', async () => {
      const mockAnalytics = {
        totalCalls: 85,
        successRate: 90,
        avgDuration: 120
      };

      analyticsService.getCallAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/api/analytics/calls')
        .expect(200);

      expect(response.body).toEqual(mockAnalytics);
      expect(analyticsService.getCallAnalytics).toHaveBeenCalledWith({});
    });

    it('should apply date filters', async () => {
      analyticsService.getCallAnalytics.mockResolvedValue({});

      await request(app)
        .get('/api/analytics/calls')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(200);

      expect(analyticsService.getCallAnalytics).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });
    });
  });

  describe('GET /api/analytics/timeseries/:metric', () => {
    it('should return timeseries data for valid metrics', async () => {
      const mockData = {
        metric: 'deliveries',
        data: [
          { date: '2024-01-01', value: 10 },
          { date: '2024-01-02', value: 15 }
        ]
      };

      analyticsService.getTimeSeriesData.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/api/analytics/timeseries/deliveries')
        .expect(200);

      expect(response.body).toEqual(mockData);
      expect(analyticsService.getTimeSeriesData).toHaveBeenCalledWith('deliveries', {});
    });

    it('should reject invalid metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/timeseries/invalid_metric')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid metric. Use: deliveries, calls'
      });
    });

    it('should apply date filters to timeseries', async () => {
      analyticsService.getTimeSeriesData.mockResolvedValue({});

      await request(app)
        .get('/api/analytics/timeseries/calls')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(200);

      expect(analyticsService.getTimeSeriesData).toHaveBeenCalledWith('calls', {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });
    });
  });

  describe('POST /api/analytics/ai/process-recording', () => {
    it('should process recording with AI', async () => {
      const mockResult = {
        recordingId: 'rec123',
        transcription: 'Hello, this is a test call',
        sentiment: 'positive',
        keywords: ['test', 'call']
      };

      aiService.processRecording.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/analytics/ai/process-recording')
        .send({
          recordingUrl: 'https://example.com/recording.mp3',
          recordingId: 'rec123'
        })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(aiService.processRecording).toHaveBeenCalledWith(
        'https://example.com/recording.mp3',
        'rec123'
      );
    });

    it('should require recordingUrl and recordingId', async () => {
      const response = await request(app)
        .post('/api/analytics/ai/process-recording')
        .send({
          recordingUrl: 'https://example.com/recording.mp3'
        })
        .expect(400);

      expect(response.body).toEqual({
        error: 'recordingUrl and recordingId are required'
      });
    });
  });

  describe('GET /api/analytics/ai/status', () => {
    it('should return AI service status', async () => {
      const mockStatus = {
        status: 'healthy',
        uptime: 3600,
        processedRecordings: 150
      };

      aiService.getStatus.mockReturnValue(mockStatus);

      const response = await request(app)
        .get('/api/analytics/ai/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(aiService.getStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/analytics/clear-cache', () => {
    it('should clear analytics cache', async () => {
      analyticsService.clearCache.mockResolvedValue();

      const response = await request(app)
        .post('/api/analytics/clear-cache')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Analytics cache cleared successfully'
      });
      expect(analyticsService.clearCache).toHaveBeenCalledTimes(1);
    });

    it('should handle clear cache errors', async () => {
      analyticsService.clearCache.mockRejectedValue(new Error('Cache error'));

      const response = await request(app)
        .post('/api/analytics/clear-cache')
        .expect(500);

      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/analytics/agent/:agentId', () => {
    it('should return agent personal stats', async () => {
      const mockDeliveries = [
        { _id: '1', status: 'completed', agent_id: 'agent-id' },
        { _id: '2', status: 'delivered', agent_id: 'agent-id' },
        { _id: '3', status: 'pending', agent_id: 'agent-id' }
      ];

      const mockRecentDeliveries = [
        { 
          _id: '1', 
          customer_id: { name: 'John Doe', phone: '+1234567890' },
          status: 'completed',
          address: '123 Main St'
        }
      ];

      Delivery.find.mockImplementation((query) => {
        if (query.agent_id === 'agent-id') {
          return {
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(mockRecentDeliveries)
          };
        }
        return mockDeliveries;
      });

      // Mock the first call to return all deliveries, second call for recent deliveries
      Delivery.find
        .mockReturnValueOnce(mockDeliveries)
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue(mockRecentDeliveries)
        });

      const response = await request(app)
        .get('/api/analytics/agent/agent-id')
        .expect(200);

      expect(response.body).toEqual({
        totalDeliveries: 3,
        completedDeliveries: 1,
        successRate: 33.33,
        recentDeliveries: [{
          id: '1',
          customer: { name: 'John Doe', phone: '+1234567890' },
          status: 'completed',
          address: '123 Main St'
        }]
      });
    });
  });
});