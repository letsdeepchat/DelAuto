const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    address: { type: String, required: true },
    scheduled_time: { type: Date, required: true },
    status: { type: String, default: 'scheduled' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Delivery', deliverySchema);
