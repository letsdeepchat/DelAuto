const express = require('express');
const router = express.Router();
const analyticsService = require('../../services/analyticsService');
const aiService = require('../../services/aiService');
const { authenticateJWT, requireAdmin } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validation');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics and AI-powered insights endpoints
 */

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get dashboard summary with key metrics
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overview:
 *                   type: object
 *                   properties:
 *                     totalDeliveries:
 *                       type: number
 *                     totalCalls:
 *                       type: number
 *                     activeAgents:
 *                       type: number
 *                     completionRate:
 *                       type: number
 *                     callSuccessRate:
 *                       type: number
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get system overview stats (legacy endpoint)
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System overview statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deliveries:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     successRate:
 *                       type: number
 *                 agents:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                 calls:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     successRate:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/analytics/agent-performance:
 *   get:
 *     summary: Get agent performance metrics
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Agent performance data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       agentId:
 *                         type: string
 *                       agentName:
 *                         type: string
 *                       deliveriesCompleted:
 *                         type: number
 *                       averageDeliveryTime:
 *                         type: number
 *                       successRate:
 *                         type: number
 *                       totalCalls:
 *                         type: number
 *                       callSuccessRate:
 *                         type: number
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     total:
 *                       type: number
 *                     pages:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */

// GET /api/analytics/dashboard - Admin: Get dashboard summary with key metrics
router.get('/dashboard', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const summary = await analyticsService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/overview - Admin: Get system overview stats (legacy endpoint)
router.get('/overview', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const summary = await analyticsService.getDashboardSummary();
    res.json({
      deliveries: {
        total: summary.overview.totalDeliveries,
        completed: summary.overview.totalDeliveries * (summary.overview.completionRate / 100),
        successRate: summary.overview.completionRate
      },
      agents: {
        total: summary.overview.activeAgents,
        active: summary.overview.activeAgents
      },
      calls: {
        total: summary.overview.totalCalls,
        successRate: summary.overview.callSuccessRate
      }
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/agent-performance - Admin: Get agent performance metrics
router.get('/agent-performance', authenticateJWT, requireAdmin, validateQuery(require('../middleware/validation').schemas.pagination), async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate || req.query.endDate) {
      filters.startDate = req.query.startDate;
      filters.endDate = req.query.endDate;
    }

    const agentStats = await analyticsService.getAgentAnalytics(filters);

    // Apply pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedStats = agentStats.slice(startIndex, endIndex);

    res.json({
      agents: paginatedStats,
      pagination: {
        page,
        limit,
        total: agentStats.length,
        pages: Math.ceil(agentStats.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/delivery-status - Admin: Get delivery status breakdown
router.get('/delivery-status', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate || req.query.endDate) {
      filters.startDate = req.query.startDate;
      filters.endDate = req.query.endDate;
    }

    const analytics = await analyticsService.getDeliveryAnalytics(filters);

    res.json({
      total: analytics.totalDeliveries,
      completed: analytics.completedDeliveries,
      failed: analytics.failedDeliveries,
      pending: analytics.pendingDeliveries,
      inTransit: analytics.inTransitDeliveries,
      completionRate: analytics.completionRate,
      failureRate: analytics.failureRate
    });
  } catch (error) {
    console.error('Error fetching delivery status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/deliveries - Admin: Get detailed delivery analytics
router.get('/deliveries', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.agentId) filters.agentId = req.query.agentId;
    if (req.query.status) filters.status = req.query.status;

    const analytics = await analyticsService.getDeliveryAnalytics(filters);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching delivery analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/calls - Admin: Get detailed call analytics
router.get('/calls', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const analytics = await analyticsService.getCallAnalytics(filters);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching call analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/timeseries/:metric - Admin: Get time series data for charts
router.get('/timeseries/:metric', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { metric } = req.params;
    const filters = {};

    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    if (!['deliveries', 'calls'].includes(metric)) {
      return res.status(400).json({ error: 'Invalid metric. Use: deliveries, calls' });
    }

    const data = await analyticsService.getTimeSeriesData(metric, filters);
    res.json(data);
  } catch (error) {
    console.error('Error fetching time series data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/analytics/ai/process-recording - Admin: Process recording with AI
router.post('/ai/process-recording', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { recordingUrl, recordingId } = req.body;

    if (!recordingUrl || !recordingId) {
      return res.status(400).json({ error: 'recordingUrl and recordingId are required' });
    }

    const result = await aiService.processRecording(recordingUrl, recordingId);
    res.json(result);
  } catch (error) {
    console.error('Error processing recording with AI:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/ai/status - Admin: Get AI service status
router.get('/ai/status', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const status = aiService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error fetching AI status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/analytics/clear-cache - Admin: Clear analytics cache
router.post('/clear-cache', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    await analyticsService.clearCache();
    res.json({ message: 'Analytics cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing analytics cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/agent/:agentId - Agent: Get personal performance stats
router.get('/agent/:agentId', authenticateJWT, async (req, res) => {
  try {
    const { agentId } = req.params;

    // Ensure agent can only view their own stats
    if (req.agent.id !== agentId && req.agent.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deliveries = await Delivery.find({ agent_id: agentId });
    const completedDeliveries = deliveries.filter(d => d.status === 'completed').length;
    const totalDeliveries = deliveries.length;
    const successRate = totalDeliveries > 0 ? (completedDeliveries / totalDeliveries * 100).toFixed(2) : 0;

    // Get recent deliveries
    const recentDeliveries = await Delivery.find({ agent_id: agentId })
      .populate('customer_id', 'name phone')
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json({
      totalDeliveries,
      completedDeliveries,
      successRate: parseFloat(successRate),
      recentDeliveries: recentDeliveries.map(d => ({
        id: d._id,
        address: d.address,
        status: d.status,
        customer: d.customer_id,
        updatedAt: d.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching agent analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/failed-delivery-reduction:
 *   get:
 *     summary: Get failed delivery reduction metrics and ROI
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (ISO format)
 *     responses:
 *       200:
 *         description: Failed delivery reduction metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentPeriod:
 *                   type: object
 *                 previousPeriod:
 *                   type: object
 *                 improvement:
 *                   type: object
 *                 aiPoweredImpact:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get('/failed-delivery-reduction', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const metrics = await analyticsService.getFailedDeliveryReductionMetrics(filters);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching failed delivery reduction metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/customer-response-patterns:
 *   get:
 *     summary: Get customer response pattern analytics
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (ISO format)
 *     responses:
 *       200:
 *         description: Customer response pattern analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hourlyPatterns:
 *                   type: array
 *                 responseTypes:
 *                   type: object
 *                 insights:
 *                   type: object
 *                 recommendations:
 *                   type: array
 */
router.get('/customer-response-patterns', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const patterns = await analyticsService.getCustomerResponsePatterns(filters);
    res.json(patterns);
  } catch (error) {
    console.error('Error fetching customer response patterns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/agent-compliance:
 *   get:
 *     summary: Get agent listening compliance metrics
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (ISO format)
 *     responses:
 *       200:
 *         description: Agent compliance analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentBreakdown:
 *                   type: array
 *                 overallStats:
 *                   type: object
 *                 benchmarks:
 *                   type: object
 *                 impact:
 *                   type: object
 */
router.get('/agent-compliance', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const compliance = await analyticsService.getAgentListeningCompliance(filters);
    res.json(compliance);
  } catch (error) {
    console.error('Error fetching agent compliance metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/roi:
 *   get:
 *     summary: Calculate ROI from delivery automation
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (ISO format)
 *     responses:
 *       200:
 *         description: ROI analysis for delivery automation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 savings:
 *                   type: object
 *                 costs:
 *                   type: object
 *                 roi:
 *                   type: object
 *                 assumptions:
 *                   type: object
 *                 projections:
 *                   type: object
 */
router.get('/roi', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const roi = await analyticsService.getROIFromDeliveryAutomation(filters);
    res.json(roi);
  } catch (error) {
    console.error('Error calculating ROI:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/ai/status:
 *   get:
 *     summary: Get AI service status and capabilities
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: AI service status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 provider:
 *                   type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 cacheEnabled:
 *                   type: boolean
 */
router.get('/ai/status', authenticateJWT, async (req, res) => {
  try {
    const status = aiService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting AI service status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/analytics/timeseries/{metric}:
 *   get:
 *     summary: Get time-series data for analytics
 *     tags: [Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: metric
 *         required: true
 *         schema:
 *           type: string
 *           enum: [deliveries, calls]
 *         description: The metric to get time-series data for
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (ISO format)
 *     responses:
 *       200:
 *         description: Time-series data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   count:
 *                     type: integer
 *                   successful:
 *                     type: integer
 */
router.get('/timeseries/:metric', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { metric } = req.params;
    const filters = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    const data = await analyticsService.getTimeSeriesData(metric, filters);
    res.json(data);
  } catch (error) {
    console.error('Error fetching time-series data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;