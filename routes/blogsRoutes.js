import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { generateSeoFiles } from '../services/seoGenerator.js';
import { invalidateSeoCache } from './seoRoutes.js';

const router = express.Router();

function formatBlog(b) {
  let body = [];
  try {
    body = typeof b.body === 'string' ? JSON.parse(b.body) : b.body || [];
  } catch {
    body = [b.body];
  }
  return {
    ...b,
    body,
    read: b.read_time,
  };
}

// GET /api/blogs - Public
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blogs ORDER BY id DESC');
    const blogs = rows.map(formatBlog);
    return res.json({ success: true, blogs });
  } catch (error) {
    console.error('Fetch blogs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blogs.' });
  }
});

// GET /api/blogs/:slug - Public
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [rows] = await pool.query('SELECT * FROM blogs WHERE slug = ? LIMIT 1', [slug]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found.' });
    }
    return res.json({ success: true, blog: formatBlog(rows[0]) });
  } catch (error) {
    console.error('Fetch blog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blog.' });
  }
});

// POST /api/blogs - Admin only
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      slug,
      title,
      category,
      stack, // specifically requested
      date,
      read_time,
      image,
      image_alt, // specifically requested
      excerpt,
      body,
      meta_title, // specifically requested SEO
      meta_description, // specifically requested SEO
      meta_keywords, // specifically requested SEO
    } = req.body;

    if (!title || !slug) {
      return res.status(400).json({ success: false, message: 'Title and slug are required.' });
    }

    const [existing] = await pool.query('SELECT id FROM blogs WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Blog slug already exists.' });
    }

    const bodyJson = Array.isArray(body)
      ? JSON.stringify(body)
      : typeof body === 'string'
      ? JSON.stringify(body.split('\n\n').filter(Boolean))
      : JSON.stringify([]);

    const formattedDate = date || new Date().toISOString().split('T')[0];

    const [result] = await pool.query(
      `INSERT INTO blogs (slug, title, category, stack, date, read_time, image, image_alt, excerpt, body, meta_title, meta_description, meta_keywords)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        title,
        category || 'General',
        stack || '',
        formattedDate,
        read_time || '5 min read',
        image || '',
        image_alt || title,
        excerpt || '',
        bodyJson,
        meta_title || title,
        meta_description || excerpt || '',
        meta_keywords || stack || '',
      ]
    );

    // Invalidate cache & regenerate dynamic SEO files with newly added blog URL
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on blog create:', err.message));

    return res.status(201).json({ success: true, message: 'Blog post created successfully.', id: result.insertId });
  } catch (error) {
    console.error('Create blog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create blog.' });
  }
});

// PUT /api/blogs/:id - Admin only
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      slug,
      title,
      category,
      stack,
      date,
      read_time,
      image,
      image_alt,
      excerpt,
      body,
      meta_title,
      meta_description,
      meta_keywords,
    } = req.body;

    const bodyJson = Array.isArray(body)
      ? JSON.stringify(body)
      : typeof body === 'string'
      ? JSON.stringify(body.split('\n\n').filter(Boolean))
      : JSON.stringify([]);

    await pool.query(
      `UPDATE blogs
       SET slug = ?, title = ?, category = ?, stack = ?, date = ?, read_time = ?,
           image = ?, image_alt = ?, excerpt = ?, body = ?,
           meta_title = ?, meta_description = ?, meta_keywords = ?
       WHERE id = ?`,
      [
        slug,
        title,
        category,
        stack || '',
        date,
        read_time,
        image,
        image_alt || '',
        excerpt,
        bodyJson,
        meta_title || '',
        meta_description || '',
        meta_keywords || '',
        id,
      ]
    );

    // Invalidate cache & regenerate dynamic SEO files with updated blog post
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on blog update:', err.message));

    return res.json({ success: true, message: 'Blog post updated successfully.' });
  } catch (error) {
    console.error('Update blog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update blog.' });
  }
});

// DELETE /api/blogs/:id - Admin only
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM blogs WHERE id = ?', [id]);

    // Invalidate cache & regenerate dynamic SEO files after blog deletion
    invalidateSeoCache();
    generateSeoFiles().catch((err) => console.warn('Failed to regenerate SEO files on blog delete:', err.message));

    return res.json({ success: true, message: 'Blog post deleted successfully.' });
  } catch (error) {
    console.error('Delete blog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete blog.' });
  }
});

export default router;
