import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { sendContactNotification } from '../services/emailService.js';

const router = express.Router();

// POST /api/contact - Public contact submission
router.post('/', async (req, res) => {
  try {
    const { name, email, branch, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO inquiries (name, email, branch, message, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, branch || 'general', message, 'unread']
    );

    // Asynchronously send email notification without blocking response
    sendContactNotification({ name, email, branch, message }).catch((err) =>
      console.warn('Contact email notification error:', err.message)
    );

    return res.status(201).json({
      success: true,
      message: 'Enquiry received successfully.',
      id: result.insertId,
    });
  } catch (error) {
    console.error('Contact submit error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit enquiry.' });
  }
});

// GET /api/contact - Admin only
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inquiries ORDER BY id DESC');
    return res.json({ success: true, inquiries: rows });
  } catch (error) {
    console.error('Fetch inquiries error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch inquiries.' });
  }
});

// PATCH /api/contact/:id - Admin only (update status)
router.patch('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query('UPDATE inquiries SET status = ? WHERE id = ?', [status || 'read', id]);
    return res.json({ success: true, message: 'Status updated.' });
  } catch (error) {
    console.error('Update inquiry status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

// DELETE /api/contact/:id - Admin only
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM inquiries WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Inquiry deleted successfully.' });
  } catch (error) {
    console.error('Delete inquiry error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete inquiry.' });
  }
});

export default router;
