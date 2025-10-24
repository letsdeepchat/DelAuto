const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['agent', 'admin'], default: 'agent' },
    active_deliveries: { type: Number, default: 0 },
    current_location: mongoose.Schema.Types.Mixed,
    is_active: { type: Boolean, default: true },
    push_subscription: mongoose.Schema.Types.Mixed, // Web Push API subscription
  },
  { timestamps: true },
);

module.exports = mongoose.model('Agent', agentSchema);
