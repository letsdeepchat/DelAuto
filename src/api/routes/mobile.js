const express = require('express');
const router = express.Router();
const Delivery = require('../../database/models/Delivery');
const Agent = require('../../database/models/Agent');
const CallLog = require('../../database/models/CallLog');
const { authenticateJWT } = require('../middleware/auth');

// GET /api/mobile/dashboard - Mobile-optimized dashboard
router.get('/dashboard', authenticateJWT, async (req, res) => {
  try {
    const agentId = req.agent.id;

    // Get agent's deliveries
    const deliveries = await Delivery.find({ agent_id: agentId })
      .populate('customer_id', 'name phone')
      .sort({ scheduled_time: 1 })
      .limit(20);

    // Get pending actions count
    const pendingCount = await Delivery.countDocuments({
      agent_id: agentId,
      status: { $in: ['scheduled', 'in_progress'] }
    });

    // Get today's deliveries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysDeliveries = await Delivery.find({
      agent_id: agentId,
      scheduled_time: { $gte: today, $lt: tomorrow }
    }).populate('customer_id', 'name phone');

    res.json({
      deliveries: deliveries.map(d => ({
        id: d._id,
        address: d.address,
        status: d.status,
        customer: {
          name: d.customer_id.name,
          phone: d.customer_id.phone
        },
        scheduledTime: d.scheduled_time,
        hasRecordings: d.call_logs && d.call_logs.length > 0
      })),
      summary: {
        totalDeliveries: deliveries.length,
        pendingActions: pendingCount,
        todaysDeliveries: todaysDeliveries.length
      },
      todaysDeliveries: todaysDeliveries.map(d => ({
        id: d._id,
        address: d.address,
        status: d.status,
        customer: {
          name: d.customer_id.name,
          phone: d.customer_id.phone
        },
        scheduledTime: d.scheduled_time
      }))
    });
  } catch (error) {
    console.error('Error fetching mobile dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/mobile/deliveries/:id - Get delivery details with recordings
router.get('/deliveries/:id', authenticateJWT, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      agent_id: req.agent.id
    }).populate('customer_id', 'name phone');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Get call logs with recordings
    const callLogs = await CallLog.find({ delivery_id: delivery._id })
      .populate('recordings')
      .sort({ createdAt: -1 });

    res.json({
      delivery: {
        id: delivery._id,
        address: delivery.address,
        status: delivery.status,
        customer: {
          name: delivery.customer_id.name,
          phone: delivery.customer_id.phone
        },
        scheduledTime: delivery.scheduled_time,
        notes: delivery.notes
      },
      callLogs: callLogs.map(log => ({
        id: log._id,
        status: log.status,
        createdAt: log.createdAt,
        recordings: log.recordings.map(rec => ({
          id: rec._id,
          url: rec.audio_url,
          duration: rec.duration,
          transcription: rec.transcription,
          createdAt: rec.createdAt
        }))
      }))
    });
  } catch (error) {
    console.error('Error fetching delivery details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/mobile/deliveries/:id/status - Update delivery status (mobile-optimized)
router.put('/deliveries/:id/status', authenticateJWT, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, agent_id: req.agent.id },
      {
        status,
        notes,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('customer_id', 'name phone');

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Send push notification for status updates (optional)
    const pushService = require('../../services/pushService');
    const agent = await Agent.findById(req.agent.id);
    if (agent && agent.push_subscription) {
      try {
        await pushService.sendDeliveryStatusNotification(agent, delivery, status);
      } catch (error) {
        console.error('Error sending push notification:', error);
      }
    }

    res.json({
      delivery: {
        id: delivery._id,
        address: delivery.address,
        status: delivery.status,
        customer: {
          name: delivery.customer_id.name,
          phone: delivery.customer_id.phone
        },
        scheduledTime: delivery.scheduled_time,
        notes: delivery.notes
      }
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/mobile/location - Update agent location (for GPS tracking)
router.post('/location', authenticateJWT, async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    await Agent.findByIdAndUpdate(req.agent.id, {
      current_location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        timestamp: new Date()
      }
    });

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/mobile/profile - Get agent profile
router.get('/profile', authenticateJWT, async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent.id).select('-password');

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
      isActive: agent.is_active,
      currentLocation: agent.current_location
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/mobile/profile - Update agent profile
router.put('/profile', authenticateJWT, async (req, res) => {
  try {
    const { name, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;

    const agent = await Agent.findByIdAndUpdate(
      req.agent.id,
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
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/mobile/emergency - Emergency alert
router.post('/emergency', authenticateJWT, async (req, res) => {
  try {
    const { message, location } = req.body;
    const agent = await Agent.findById(req.agent.id);

    // Log emergency
    console.error(`EMERGENCY ALERT from agent ${agent.name} (${agent.email}): ${message}`);

    // Send SMS to admin (if configured)
    if (process.env.ADMIN_PHONE && process.env.TWILIO_ACCOUNT_SID !== 'ACdummy') {
      const twilioService = require('../../services/twilioService');
      try {
        await twilioService.twilioClient.messages.create({
          body: `EMERGENCY: ${agent.name} - ${message}${location ? ` Location: ${location.latitude}, ${location.longitude}` : ''}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.ADMIN_PHONE
        });
      } catch (error) {
        console.error('Error sending emergency SMS:', error);
      }
    }

    // Send push notification to all admins
    const pushService = require('../../services/pushService');
    const admins = await Agent.find({ role: 'admin', push_subscription: { $exists: true } });
    for (const admin of admins) {
      try {
        await pushService.sendToAgent(admin, {
          title: 'Emergency Alert',
          body: `${agent.name}: ${message}`,
          data: {
            type: 'emergency',
            agentId: agent._id,
            message: message,
            location: location
          }
        });
      } catch (error) {
        console.error('Error sending emergency push notification:', error);
      }
    }

    res.json({ message: 'Emergency alert sent' });
  } catch (error) {
    console.error('Error sending emergency alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;