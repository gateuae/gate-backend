import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { generateSeoFiles } from '../services/seoGenerator.js';

const router = express.Router();

const parseSettingValue = (val) => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  // Only parse if it represents a JSON object or array
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
};

// GET /api/settings - Public
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = parseSettingValue(row.setting_value);
    }
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('Fetch settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
});

// PUT /api/settings - Protected (Admin only)
router.put('/', authenticateAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const updates = req.body; // e.g. { social_links: {...}, contact_email: "...", ... }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload.' });
    }

    await connection.beginTransaction();

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'promo_disclaimer' || key === 'contact_work_timing') continue;
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      await connection.query(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, stringValue]
      );
    }

    await connection.commit();

    // Fetch updated settings
    const [rows] = await connection.query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = parseSettingValue(row.setting_value);
    }

    // Regenerate dynamic SEO, AEO, and GEO files with updated settings (social links, contact, etc.)
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on settings update:', err.message));

    return res.json({ success: true, message: 'Settings updated successfully.', settings });
  } catch (error) {
    await connection.rollback();
    console.error('Update settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  } finally {
    connection.release();
  }
});

export default router;
