const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema(
  {
    call_log_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true,
    },
    audio_url: String,
    transcription: String,
    instructions: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model('Recording', recordingSchema);
