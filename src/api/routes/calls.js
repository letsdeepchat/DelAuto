const express = require('express');
const router = express.Router();
const { addCallJob } = require('../../services/queueService');
const Delivery = require('../../database/models/Delivery');
const CallLog = require('../../database/models/CallLog');

// POST /api/calls/initiate - Trigger customer call
router.post('/initiate', async (req, res) => {
  try {
    const { delivery_id, delay } = req.body;

    if (!delivery_id) {
      return res.status(400).json({ error: 'delivery_id is required' });
    }

    // Verify delivery exists
    const delivery = await Delivery.findById(delivery_id);

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Add job to queue
    const job = await addCallJob({ deliveryId: delivery_id }, delay || 0);

    res.json({
      message: 'Call job queued successfully',
      job_id: job.id,
      status: 'queued'
    });
  } catch (error) {
    console.error('Error queuing call:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/calls/:delivery_id - Get call logs for delivery
router.get('/:delivery_id', async (req, res) => {
  try {
    const { delivery_id } = req.params;

    const callLogs = await CallLog.find({ delivery_id }).sort({ createdAt: -1 });

    res.json(callLogs);
  } catch (error) {
    console.error('Error fetching call logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;