const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  delivery_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true },
  call_sid: { type: String, unique: true },
  status: String,
  duration: Number,
  recording_url: String,
}, { timestamps: true });

module.exports = mongoose.model('CallLog', callLogSchema);