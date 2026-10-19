import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await pool.query('SELECT * FROM admins WHERE email = ? OR username = ? LIMIT 1', [email, email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username },
      process.env.JWT_SECRET || 'super_market_secret_jwt_key_2026_secure',
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username, email: admin.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, email, created_at FROM admins WHERE id = ?', [req.admin.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
    }
    const admin = rows[0];
    const refreshedToken = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username },
      process.env.JWT_SECRET || 'super_market_secret_jwt_key_2026_secure',
      { expiresIn: '30d' }
    );
    return res.json({ success: true, admin, token: refreshedToken });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch admin info.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticateAdmin, async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ success: false, message: 'Username and email are required.' });
    }

    // Check if email taken by another admin
    const [existing] = await pool.query('SELECT id FROM admins WHERE email = ? AND id != ?', [email, req.admin.id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email is already in use by another admin.' });
    }

    await pool.query('UPDATE admins SET username = ?, email = ? WHERE id = ?', [username, email, req.admin.id]);

    const [updated] = await pool.query('SELECT id, username, email, created_at FROM admins WHERE id = ?', [req.admin.id]);
    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      admin: updated[0],
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new password are required.' });
    }

    const [rows] = await pool.query('SELECT password FROM admins WHERE id = ?', [req.admin.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashed, req.admin.id]);

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

export default router;
