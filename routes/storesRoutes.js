import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { generateSeoFiles } from '../services/seoGenerator.js';
import { invalidateSeoCache } from './seoRoutes.js';

const router = express.Router();

function formatStore(s) {
  let highlights = [];
  let coords = [25.1121, 55.1965];
  try {
    highlights = typeof s.highlights === 'string' ? JSON.parse(s.highlights) : s.highlights || [];
  } catch {
    highlights = [];
  }
  try {
    coords = typeof s.coords === 'string' ? JSON.parse(s.coords) : s.coords || [25.1121, 55.1965];
  } catch {
    coords = [25.1121, 55.1965];
  }

  return {
    ...s,
    open: s.open_hour,
    close: s.close_hour,
    highlights,
    coords,
  };
}

// GET /api/stores - Public
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stores ORDER BY sort_order ASC, id ASC');
    const stores = rows.map(formatStore);
    return res.json({ success: true, stores });
  } catch (error) {
    console.error('Fetch stores error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch stores.' });
  }
});

// GET /api/stores/:slug - Public
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [rows] = await pool.query('SELECT * FROM stores WHERE slug = ? LIMIT 1', [slug]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Store not found.' });
    }
    return res.json({ success: true, store: formatStore(rows[0]) });
  } catch (error) {
    console.error('Fetch store error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch store.' });
  }
});

// POST /api/stores - Admin only
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      slug,
      name,
      city,
      address,
      phone,
      hours,
      open_hour,
      close_hour,
      highlights,
      coords,
      image,
      image_alt,
      tagline,
      sort_order,
    } = req.body;

    if (!slug || !name || !address || !phone || !hours) {
      return res.status(400).json({ success: false, message: 'Required fields: slug, name, address, phone, hours.' });
    }

    const [existing] = await pool.query('SELECT id FROM stores WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Store slug already exists.' });
    }

    const [result] = await pool.query(
      `INSERT INTO stores (slug, name, city, address, phone, hours, open_hour, close_hour, highlights, coords, image, image_alt, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        name,
        city || 'Dubai',
        address,
        phone,
        hours,
        open_hour ?? 8,
        close_hour ?? 24,
        JSON.stringify(highlights || []),
        JSON.stringify(coords || [25.1121, 55.1965]),
        image || '',
        image_alt || name,
        tagline || '',
        sort_order || 0,
      ]
    );

    // Invalidate cache & regenerate dynamic SEO, AEO, and GEO files with updated store branches & coordinates
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on store create:', err.message));

    return res.status(201).json({ success: true, message: 'Store created successfully.', id: result.insertId });
  } catch (error) {
    console.error('Create store error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create store.' });
  }
});

// PUT /api/stores/:id - Admin only
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug,
      name,
      city,
      address,
      phone,
      hours,
      open_hour,
      close_hour,
      highlights,
      coords,
      image,
      image_alt,
      tagline,
      sort_order,
    } = req.body;

    await pool.query(
      `UPDATE stores
       SET slug = ?, name = ?, city = ?, address = ?, phone = ?, hours = ?, open_hour = ?, close_hour = ?,
           highlights = ?, coords = ?, image = ?, image_alt = ?, tagline = ?, sort_order = ?
       WHERE id = ?`,
      [
        slug,
        name,
        city,
        address,
        phone,
        hours,
        open_hour ?? 8,
        close_hour ?? 24,
        JSON.stringify(highlights || []),
        JSON.stringify(coords || [25.1121, 55.1965]),
        image,
        image_alt,
        tagline,
        sort_order || 0,
        id,
      ]
    );

    // Invalidate cache & regenerate dynamic SEO, AEO, and GEO files with updated store details
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on store update:', err.message));

    return res.json({ success: true, message: 'Store updated successfully.' });
  } catch (error) {
    console.error('Update store error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update store.' });
  }
});

// DELETE /api/stores/:id - Admin only
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM stores WHERE id = ?', [id]);

    // Invalidate cache & regenerate dynamic SEO, AEO, and GEO files after store deletion
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on store delete:', err.message));

    return res.json({ success: true, message: 'Store deleted successfully.' });
  } catch (error) {
    console.error('Delete store error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete store.' });
  }
});

export default router;
