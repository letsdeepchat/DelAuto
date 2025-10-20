const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: String,
  preferences: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);