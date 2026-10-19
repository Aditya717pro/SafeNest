/**
 * User Settings Schema & Model
 */

import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  customWhitelist: {
    type: [String],
    default: []
  },
  customBlacklist: {
    type: [String],
    default: []
  },
  strictSafeSearch: {
    type: Boolean,
    default: true
  },
  blockExplicitImages: {
    type: Boolean,
    default: true
  },
  challengeRequired: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

settingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

export const Settings = mongoose.model('Settings', settingsSchema);
