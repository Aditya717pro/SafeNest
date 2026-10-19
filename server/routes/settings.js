/**
 * User Settings Routes
 */

import express from 'express';
import { Settings } from '../models/Settings.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/settings
router.get('/', authenticate, async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.id });
    if (!settings) {
      settings = await Settings.create({
        userId: req.user.id,
        enabled: true,
        customWhitelist: [],
        customBlacklist: []
      });
    }
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings
router.put('/', authenticate, async (req, res, next) => {
  try {
    const {
      enabled,
      customWhitelist,
      customBlacklist,
      strictSafeSearch,
      blockExplicitImages,
      challengeRequired
    } = req.body;

    const updates = {};
    if (typeof enabled !== 'undefined') updates.enabled = enabled;
    if (Array.isArray(customWhitelist)) updates.customWhitelist = customWhitelist;
    if (Array.isArray(customBlacklist)) updates.customBlacklist = customBlacklist;
    if (typeof strictSafeSearch !== 'undefined') updates.strictSafeSearch = strictSafeSearch;
    if (typeof blockExplicitImages !== 'undefined') updates.blockExplicitImages = blockExplicitImages;
    if (typeof challengeRequired !== 'undefined') updates.challengeRequired = challengeRequired;
    updates.updatedAt = new Date();

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.id },
      { $set: updates },
      { new: true, upsert: true }
    );

    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

export default router;
