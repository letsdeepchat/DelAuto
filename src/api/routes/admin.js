const express = require('express');
const router = express.Router();
const Delivery = require('../../database/models/Delivery');
const Agent = require('../../database/models/Agent');
const CallLog = require('../../database/models/CallLog');
const Recording = require('../../database/models/Recording');
const { authenticateJWT, requireAdmin } = require('../middleware/auth');

// GET /api/admin/dashboard - Admin dashboard data
router.get('/dashboard', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    // Get system overview stats
    const [
      totalDeliveries,
      deliveriesByStatus,
      activeAgents,
      recentDeliveries,
      recentCallLogs,
      systemHealth
    ] = await Promise.all([
      Delivery.countDocuments(),
      Delivery.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Agent.find({ is_active: true }).select('name email phone'),
      Delivery.find()
        .populate('customer_id', 'name phone')
        .populate('agent_id', 'name')
        .sort({ updatedAt: -1 })
        .limit(10),
      CallLog.find()
        .populate('delivery_id', 'address')
        .sort({ createdAt: -1 })
        .limit(10),
      getSystemHealth()
    ]);

    // Format status counts
    const statusCounts = {};
    deliveriesByStatus.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    res.json({
      overview: {
        totalDeliveries,
        statusBreakdown: statusCounts,
        activeAgents: activeAgents.length
      },
      activeAgents,
      recentDeliveries: recentDeliveries.map(d => ({
        id: d._id,
        address: d.address,
        status: d.status,
        customer: d.customer_id,
        agent: d.agent_id,
        scheduledTime: d.scheduled_time,
        updatedAt: d.updatedAt
      })),
      recentCallLogs: recentCallLogs.map(c => ({
        id: c._id,
        delivery: c.delivery_id,
        status: c.status,
        createdAt: c.createdAt
      })),
      systemHealth
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/deliveries - Admin delivery management
router.get('/deliveries', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { status, agent, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) query.status = status;
    if (agent) query.agent_id = agent;

    const deliveries = await Delivery.find(query)
      .populate('customer_id', 'name phone')
      .populate('agent_id', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Delivery.countDocuments(query);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d._id,
        address: d.address,
        status: d.status,
        customer: d.customer_id,
        agent: d.agent_id,
        scheduledTime: d.scheduled_time,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/deliveries - Create new delivery
router.post('/deliveries', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { address, customer_id, agent_id, scheduled_time } = req.body;

    const delivery = new Delivery({
      address,
      customer_id,
      agent_id,
      scheduled_time: new Date(scheduled_time),
      status: 'scheduled'
    });

    await delivery.save();

    // Populate and return
    await delivery.populate('customer_id', 'name phone');
    await delivery.populate('agent_id', 'name email');

    res.status(201).json({
      id: delivery._id,
      address: delivery.address,
      status: delivery.status,
      customer: delivery.customer_id,
      agent: delivery.agent_id,
      scheduledTime: delivery.scheduled_time
    });
  } catch (error) {
    console.error('Error creating delivery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/deliveries/:id - Update delivery
router.put('/deliveries/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { status, agent_id, scheduled_time } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (agent_id) updateData.agent_id = agent_id;
    if (scheduled_time) updateData.scheduled_time = new Date(scheduled_time);

    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer_id', 'name phone').populate('agent_id', 'name email');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    res.json({
      id: delivery._id,
      address: delivery.address,
      status: delivery.status,
      customer: delivery.customer_id,
      agent: delivery.agent_id,
      scheduledTime: delivery.scheduled_time
    });
  } catch (error) {
    console.error('Error updating delivery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/deliveries/:id - Delete delivery
router.delete('/deliveries/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndDelete(req.params.id);

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    res.json({ message: 'Delivery deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/agents - Agent management
router.get('/agents', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const agents = await Agent.find().select('-password').sort({ createdAt: -1 });

    res.json(agents.map(agent => ({
      id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
      isActive: agent.is_active,
      activeDeliveries: agent.active_deliveries,
      createdAt: agent.createdAt
    })));
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/agents - Create new agent
router.post('/agents', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const agent = new Agent({
      name,
      email,
      phone,
      password, // Will be hashed by pre-save middleware
      role: role || 'agent'
    });

    await agent.save();

    res.status(201).json({
      id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
      isActive: agent.is_active
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Email or phone already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// PUT /api/admin/agents/:id - Update agent
router.put('/agents/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, role, is_active } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;
    if (typeof is_active === 'boolean') updateData.is_active = is_active;

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
      isActive: agent.is_active
    });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/agents/:id - Delete agent
router.delete('/agents/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findByIdAndDelete(req.params.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to get system health
async function getSystemHealth() {
  const health = {
    database: 'unknown',
    redis: 'unknown',
    twilio: 'unknown',
    storage: 'unknown'
  };

  // Check MongoDB
  try {
    await Delivery.findOne().limit(1);
    health.database = 'healthy';
  } catch (error) {
    health.database = 'unhealthy';
  }

  // Check Redis (simplified)
  health.redis = process.env.REDIS_URL ? 'configured' : 'not_configured';

  // Check Twilio
  health.twilio = process.env.TWILIO_ACCOUNT_SID !== 'ACdummy' ? 'configured' : 'not_configured';

  // Check Storage
  health.storage = process.env.R2_ACCESS_KEY_ID !== 'dummy_access_key' ? 'configured' : 'not_configured';

  return health;
}

module.exports = router;