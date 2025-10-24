const express = require('express');
const router = express.Router();
const routingService = require('../../services/routingService');
const aiService = require('../../services/aiService');
const { authenticateJWT, requireAdmin } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validation');

/**
 * @swagger
 * tags:
 *   name: Routing
 *   description: Advanced routing and AI-powered assignment endpoints
 */

/**
 * @swagger
 * /api/routing/assign-agent:
 *   post:
 *     summary: Smart agent assignment based on delivery complexity
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deliveryId
 *               - availableAgentIds
 *             properties:
 *               deliveryId:
 *                 type: string
 *                 description: ID of the delivery to assign
 *               availableAgentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of available agent IDs
 *     responses:
 *       200:
 *         description: Smart agent assignment result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 agent:
 *                   type: object
 *                   description: Assigned agent details
 *                 score:
 *                   type: number
 *                   description: Assignment score
 *                 reasoning:
 *                   type: string
 *                   description: Reasoning for the assignment
 *                 alternatives:
 *                   type: array
 *                   description: Alternative agent options
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/assign-agent',
  authenticateJWT,
  requireAdmin,
  async (req, res) => {
    try {
      const { deliveryId, availableAgentIds } = req.body;

      if (
        !deliveryId ||
        !availableAgentIds ||
        !Array.isArray(availableAgentIds)
      ) {
        return res.status(400).json({
          error:
            'Missing required fields: deliveryId and availableAgentIds array',
        });
      }

      // Get delivery details (simplified - in production, fetch from database)
      const delivery = {
        _id: deliveryId,
        instructions: req.body.instructions || '',
        transcription: req.body.transcription || '',
        priority: req.body.priority || 'medium',
      };

      // Get available agents (simplified - in production, fetch from database)
      const availableAgents = availableAgentIds.map((agentId) => ({
        _id: agentId,
        name: `Agent ${agentId.slice(-4)}`, // Placeholder name
        // In production, fetch full agent details
      }));

      const assignment = await routingService.assignAgentSmart(
        delivery,
        availableAgents,
      );
      res.json(assignment);
    } catch (error) {
      console.error('Error in smart agent assignment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @swagger
 * /api/routing/optimal-call-timing:
 *   post:
 *     summary: Calculate optimal call timing based on geolocation and preferences
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deliveryId
 *               - customerId
 *             properties:
 *               deliveryId:
 *                 type: string
 *                 description: ID of the delivery
 *               customerId:
 *                 type: string
 *                 description: ID of the customer
 *               customerTimezone:
 *                 type: string
 *                 description: Customer timezone (IANA format)
 *                 default: America/New_York
 *     responses:
 *       200:
 *         description: Optimal call timing recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 optimalTimes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       datetime:
 *                         type: string
 *                         format: date-time
 *                       localHour:
 *                         type: integer
 *                       dayOfWeek:
 *                         type: integer
 *                       score:
 *                         type: number
 *                       reasoning:
 *                         type: string
 *                 customerTimezone:
 *                   type: string
 *                 alternatives:
 *                   type: array
 *                   description: Alternative timing options
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/optimal-call-timing',
  authenticateJWT,
  requireAdmin,
  async (req, res) => {
    try {
      const { deliveryId, customerId, customerTimezone } = req.body;

      if (!deliveryId || !customerId) {
        return res.status(400).json({
          error: 'Missing required fields: deliveryId and customerId',
        });
      }

      // Get delivery and customer details (simplified - in production, fetch from database)
      const delivery = {
        _id: deliveryId,
        address: req.body.deliveryAddress || '',
        // In production, fetch full delivery details
      };

      const customer = {
        _id: customerId,
        timezone: customerTimezone || 'America/New_York',
        // In production, fetch full customer details
      };

      const timing = await routingService.calculateOptimalCallTiming(
        delivery,
        customer,
      );
      res.json(timing);
    } catch (error) {
      console.error('Error calculating optimal call timing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @swagger
 * /api/routing/learn-customer-preferences:
 *   post:
 *     summary: Learn and update customer call preferences from call results
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - callResult
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: ID of the customer
 *               callResult:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     enum: [completed, no-answer, busy, failed]
 *                     description: Call result status
 *                   duration:
 *                     type: number
 *                     description: Call duration in seconds
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     description: When the call was made
 *     responses:
 *       200:
 *         description: Customer preferences updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preferences:
 *                   type: object
 *                   description: Updated customer preferences
 *                 historySize:
 *                   type: integer
 *                   description: Number of call results in history
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/learn-customer-preferences',
  authenticateJWT,
  requireAdmin,
  async (req, res) => {
    try {
      const { customerId, callResult } = req.body;

      if (!customerId || !callResult) {
        return res.status(400).json({
          error: 'Missing required fields: customerId and callResult',
        });
      }

      const result = await routingService.learnCustomerPreferences(
        customerId,
        callResult,
      );
      res.json(result);
    } catch (error) {
      console.error('Error learning customer preferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @swagger
 * /api/routing/ai/voice-authenticate:
 *   post:
 *     summary: Voice authentication using AI-powered speaker verification
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - audioUrl
 *               - profileId
 *             properties:
 *               audioUrl:
 *                 type: string
 *                 description: URL of the voice sample to authenticate
 *               profileId:
 *                 type: string
 *                 description: Voice profile ID to verify against
 *     responses:
 *       200:
 *         description: Voice authentication result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 authenticated:
 *                   type: boolean
 *                 confidence:
 *                   type: number
 *                   description: Authentication confidence score (0-100)
 *                 profileId:
 *                   type: string
 *                 method:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 note:
 *                   type: string
 *                   description: Additional information about the result
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/ai/voice-authenticate',
  authenticateJWT,
  requireAdmin,
  async (req, res) => {
    try {
      const { audioUrl, profileId } = req.body;

      if (!audioUrl || !profileId) {
        return res.status(400).json({
          error: 'Missing required fields: audioUrl and profileId',
        });
      }

      const result = await aiService.authenticateVoice(audioUrl, profileId);
      res.json(result);
    } catch (error) {
      console.error('Error in voice authentication:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @swagger
 * /api/routing/ai/create-voice-profile:
 *   post:
 *     summary: Create a voice profile for authentication
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - audioUrl
 *               - userId
 *             properties:
 *               audioUrl:
 *                 type: string
 *                 description: URL of enrollment audio sample
 *               userId:
 *                 type: string
 *                 description: User ID to create profile for
 *     responses:
 *       200:
 *         description: Voice profile creation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 profileId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post(
  '/ai/create-voice-profile',
  authenticateJWT,
  requireAdmin,
  async (req, res) => {
    try {
      const { audioUrl, userId } = req.body;

      if (!audioUrl || !userId) {
        return res.status(400).json({
          error: 'Missing required fields: audioUrl and userId',
        });
      }

      const result = await aiService.createVoiceProfile(audioUrl, userId);
      res.json(result);
    } catch (error) {
      console.error('Error creating voice profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @swagger
 * /api/routing/status:
 *   get:
 *     summary: Get routing service status and capabilities
 *     tags: [Routing]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Routing service status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 cacheEnabled:
 *                   type: boolean
 *                 version:
 *                   type: string
 */
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const status = routingService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting routing service status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
