const express = require('express');
const router = express.Router();
const Agent = require('../../database/models/Agent');
const { authenticateJWT } = require('../middleware/auth');

// Subscribe to push notifications
router.post('/subscribe', authenticateJWT, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription) {
      return res.status(400).json({ error: 'Push subscription is required' });
    }

    // Update agent's push subscription
    await Agent.findByIdAndUpdate(req.agent.id, {
      push_subscription: subscription
    });

    res.json({ message: 'Push subscription saved successfully' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticateJWT, async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.agent.id, {
      $unset: { push_subscription: 1 }
    });

    res.json({ message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get VAPID public key for client-side registration
router.get('/vapid-public-key', (req, res) => {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  res.json({ publicKey: vapidPublicKey });
});

// Test push notification (for development)
router.post('/test', authenticateJWT, async (req, res) => {
  try {
    const pushService = require('../../services/pushService');
    const agent = await Agent.findById(req.agent.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await pushService.sendToAgent(agent, {
      title: 'Test Notification',
      body: 'This is a test push notification',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    });

    res.json({ message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;