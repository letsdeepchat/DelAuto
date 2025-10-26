const express = require('express');
const router = express.Router();
const Delivery = require('../../database/models/Delivery');
const Agent = require('../../database/models/Agent');
const { authenticateJWT, requireAdmin } = require('../middleware/auth');

// GET /api/agents/:agentId/deliveries - Get agent's deliveries (access control)
router.get('/:agentId/deliveries', authenticateJWT, async (req, res) => {
  try {
    const { agentId } = req.params;

    // Check if user is accessing their own data or is admin
    if (req.user.id !== agentId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const deliveries = await Delivery.find({ agent_id: agentId })
      .populate('customer_id')
      .sort({ scheduled_time: -1 });

    res.json({ success: true, data: deliveries });
  } catch (error) {
    console.error('Error fetching agent deliveries:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/agents/profile - Get current agent profile
router.get('/profile', authenticateJWT, async (req, res) => {
  try {
    const agent = await Agent.findById(req.user.id).select('-password');
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent profile:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/agents/deliveries - Get deliveries for current agent with recordings
router.get('/deliveries', authenticateJWT, async (req, res) => {
  try {
    const agentId = req.user.id;

    // Find deliveries for the agent, populate customer
    const deliveries = await Delivery.find({ agent_id: agentId })
      .populate('customer_id', 'name phone')
      .sort({ scheduled_time: 1 });

    // For each delivery, fetch call logs and recordings
    const deliveriesWithRecordings = await Promise.all(
      deliveries.map(async (delivery) => {
        const callLogs = await require('../../database/models/CallLog')
          .find({ delivery_id: delivery._id })
          .populate('recordings');
        return {
          ...delivery.toObject(),
          call_logs: callLogs,
        };
      }),
    );

    res.json({ success: true, data: deliveriesWithRecordings });
  } catch (error) {
    console.error('Error fetching agent deliveries:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/agents/deliveries/:deliveryId/status - Update delivery status
router.put(
  '/deliveries/:deliveryId/status',
  authenticateJWT,
  async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const { status } = req.body;
      const agentId = req.user.id;

      if (
        !['scheduled', 'in_progress', 'completed', 'failed'].includes(status)
      ) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      // Find and update delivery
      const delivery = await Delivery.findOneAndUpdate(
        { _id: deliveryId, agent_id: agentId },
        { status },
        { new: true },
      ).populate('customer_id', 'name phone');

      if (!delivery) {
        return res
          .status(404)
          .json({ success: false, error: 'Delivery not found or not assigned to you' });
      }

      res.json({ success: true, data: delivery });
    } catch (error) {
      console.error('Error updating delivery status:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// Admin routes

// GET /api/agents - Admin: List all agents
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const agents = await Agent.find()
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agents - Admin: Create new agent
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, role = 'agent' } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if agent exists
    const existing = await Agent.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res
        .status(409)
        .json({ error: 'Agent with this email or phone already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const agent = new Agent({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
    });

    await agent.save();

    res.status(201).json({
      message: 'Agent created successfully',
      agent: { id: agent._id, name, email, role },
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/agents/:id - Admin: Update agent
router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow password updates through this endpoint
    delete updates.password;

    const agent = await Agent.findByIdAndUpdate(id, updates, {
      new: true,
    }).select('-password');
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/agents/:id - Admin: Deactivate agent
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await Agent.findByIdAndUpdate(
      id,
      { is_active: false },
      { new: true },
    );
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ message: 'Agent deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
