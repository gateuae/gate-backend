import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { generateSeoFiles } from '../services/seoGenerator.js';

const router = express.Router();

// GET /api/pages - Get all CMS pages
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pages_content ORDER BY page_name ASC');
    const pages = rows.map((p) => {
      let content = {};
      try {
        content = JSON.parse(p.content_json);
      } catch {
        content = p.content_json;
      }
      return {
        id: p.id,
        page_name: p.page_name,
        content,
        meta_title: p.meta_title,
        meta_description: p.meta_description,
        meta_keywords: p.meta_keywords,
        updated_at: p.updated_at,
      };
    });
    return res.json({ success: true, pages });
  } catch (error) {
    console.error('Fetch all pages error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch pages content.' });
  }
});

// GET /api/pages/:pageName - Get content for a specific page
router.get('/:pageName', async (req, res) => {
  try {
    const { pageName } = req.params;
    const [rows] = await pool.query('SELECT * FROM pages_content WHERE page_name = ? LIMIT 1', [pageName]);
    if (rows.length === 0) {
      return res.json({
        success: true,
        page: {
          id: null,
          page_name: pageName,
          content: {},
          meta_title: '',
          meta_description: '',
          meta_keywords: '',
          updated_at: null,
        },
      });
    }

    const row = rows[0];
    let content = {};
    try {
      content = JSON.parse(row.content_json);
    } catch {
      content = row.content_json;
    }

    return res.json({
      success: true,
      page: {
        id: row.id,
        page_name: row.page_name,
        content,
        meta_title: row.meta_title,
        meta_description: row.meta_description,
        meta_keywords: row.meta_keywords,
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Fetch page error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch page content.' });
  }
});

// PUT /api/pages/:pageName - Update page content and SEO (Admin only)
router.put('/:pageName', authenticateAdmin, async (req, res) => {
  try {
    const { pageName } = req.params;
    const { content, meta_title, meta_description, meta_keywords } = req.body;

    const contentString = typeof content === 'object' ? JSON.stringify(content) : String(content || '{}');

    await pool.query(
      `INSERT INTO pages_content (page_name, content_json, meta_title, meta_description, meta_keywords)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         content_json = VALUES(content_json),
         meta_title = VALUES(meta_title),
         meta_description = VALUES(meta_description),
         meta_keywords = VALUES(meta_keywords)`,
      [pageName, contentString, meta_title || '', meta_description || '', meta_keywords || '']
    );

    generateSeoFiles().catch((err) => console.warn('SEO regen on page update failed:', err.message));

    return res.json({ success: true, message: `Page content for '${pageName}' updated successfully.` });
  } catch (error) {
    console.error('Update page error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update page content.' });
  }
});

export default router;
