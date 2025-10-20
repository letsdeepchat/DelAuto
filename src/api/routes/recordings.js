const express = require('express');
const router = express.Router();
const Recording = require('../../database/models/Recording');

// GET /api/recordings/:id - Get recording by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const recording = await Recording.findById(id).populate({
      path: 'call_log_id',
      populate: { path: 'delivery_id' }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(recording);
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/recordings/delivery/:delivery_id - Get recordings for delivery
router.get('/delivery/:delivery_id', async (req, res) => {
  try {
    const { delivery_id } = req.params;

    const recordings = await Recording.find()
      .populate({
        path: 'call_log_id',
        match: { delivery_id },
        populate: { path: 'delivery_id' }
      })
      .sort({ createdAt: -1 });

    // Filter out recordings where call_log_id doesn't match the delivery_id
    const filteredRecordings = recordings.filter(recording => recording.call_log_id);

    res.json(filteredRecordings);
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;