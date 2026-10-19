/**
 * Telemetry and Usage Analytics Routes
 */

import express from 'express';
import { BlockStats } from '../models/BlockStats.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

function getTodayString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// POST /api/stats - Records/increments telemetry for current date
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { blockedSites = 0, maskedWords = 0, blurredImages = 0 } = req.body;
    const date = req.body.date || getTodayString();

    const stat = await BlockStats.findOneAndUpdate(
      { userId: req.user.id, date },
      {
        $inc: {
          blockedSites: Number(blockedSites) || 0,
          maskedWords: Number(maskedWords) || 0,
          blurredImages: Number(blurredImages) || 0
        }
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, stat });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/weekly - Aggregates 7-day metrics for dashboard charts
router.get('/weekly', authenticate, async (req, res, next) => {
  try {
    // Generate dates for the past 7 days
    const past7Days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      past7Days.push(d.toISOString().split('T')[0]);
    }

    const existingStats = await BlockStats.find({
      userId: req.user.id,
      date: { $in: past7Days }
    });

    const statMap = new Map();
    existingStats.forEach((s) => {
      statMap.set(s.date, s);
    });

    // Format weekly chart data
    const weeklyData = past7Days.map((dateStr) => {
      const entry = statMap.get(dateStr);
      const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
      return {
        date: dateStr,
        day: dayName,
        blockedSites: entry ? entry.blockedSites : 0,
        maskedWords: entry ? entry.maskedWords : 0,
        blurredImages: entry ? entry.blurredImages : 0
      };
    });

    // Calculate weekly totals
    const totals = weeklyData.reduce(
      (acc, curr) => ({
        blockedSites: acc.blockedSites + curr.blockedSites,
        maskedWords: acc.maskedWords + curr.maskedWords,
        blurredImages: acc.blurredImages + curr.blurredImages
      }),
      { blockedSites: 0, maskedWords: 0, blurredImages: 0 }
    );

    res.json({
      success: true,
      weekly: weeklyData,
      totals
    });
  } catch (err) {
    next(err);
  }
});

export default router;
