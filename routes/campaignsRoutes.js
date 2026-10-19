import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

function formatCampaign(c) {
  let branches = [];
  let pages = [];
  try {
    branches = typeof c.branches === 'string' ? JSON.parse(c.branches) : c.branches || [];
  } catch {
    branches = [];
  }
  try {
    pages = typeof c.pages === 'string' ? JSON.parse(c.pages) : c.pages || [];
  } catch {
    pages = [];
  }

  return {
    ...c,
    id: c.campaign_id,
    db_id: c.id,
    branches,
    pages,
  };
}

// GET /api/campaigns - Public (supports ?all=1 for admin)
router.get('/', async (req, res) => {
  try {
    const { all } = req.query;
    const sql = (all === '1' || all === 'true')
      ? 'SELECT * FROM campaigns ORDER BY id ASC'
      : 'SELECT * FROM campaigns WHERE is_active = TRUE ORDER BY id ASC';
    const [rows] = await pool.query(sql);
    const campaigns = rows.map(formatCampaign);
    return res.json({ success: true, campaigns });
  } catch (error) {
    console.error('Fetch campaigns error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch campaigns.' });
  }
});

// POST /api/campaigns - Admin only
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { campaign_id, title, season, blurb, cover, cover_alt, branches, pages } = req.body;

    if (!campaign_id || !title) {
      return res.status(400).json({ success: false, message: 'Campaign ID and title are required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO campaigns (campaign_id, title, season, blurb, cover, cover_alt, branches, pages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campaign_id,
        title,
        season || '',
        blurb || '',
        cover || '',
        cover_alt || title || '',
        JSON.stringify(branches || []),
        JSON.stringify(pages || []),
      ]
    );

    return res.status(201).json({ success: true, message: 'Campaign created successfully.', id: result.insertId });
  } catch (error) {
    console.error('Create campaign error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create campaign.' });
  }
});

// PUT /api/campaigns/:id - Admin only
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { campaign_id, title, season, blurb, cover, cover_alt, branches, pages, is_active } = req.body;

    await pool.query(
      `UPDATE campaigns
       SET campaign_id = ?, title = ?, season = ?, blurb = ?, cover = ?, cover_alt = ?,
           branches = ?, pages = ?, is_active = ?
       WHERE id = ?`,
      [
        campaign_id,
        title,
        season,
        blurb,
        cover,
        cover_alt || '',
        JSON.stringify(branches || []),
        JSON.stringify(pages || []),
        is_active ?? true,
        id,
      ]
    );

    return res.json({ success: true, message: 'Campaign updated successfully.' });
  } catch (error) {
    console.error('Update campaign error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update campaign.' });
  }
});

// DELETE /api/campaigns/:id - Admin only
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM campaigns WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Campaign deleted successfully.' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete campaign.' });
  }
});

export default router;
