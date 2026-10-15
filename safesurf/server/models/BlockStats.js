/**
 * Telemetry & Daily Stats Schema & Model
 */

import mongoose from 'mongoose';

const blockStatsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true
  },
  blockedSites: {
    type: Number,
    default: 0
  },
  maskedWords: {
    type: Number,
    default: 0
  },
  blurredImages: {
    type: Number,
    default: 0
  }
});

// Composite index to ensure one stats entry per user per date
blockStatsSchema.index({ userId: 1, date: 1 }, { unique: true });

export const BlockStats = mongoose.model('BlockStats', blockStatsSchema);
