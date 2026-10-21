import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { getJwtSecret } from '../config/security.js';

const router = express.Router();

// Rate limiter for admin login to prevent brute force attacks (10 attempts per 15 minutes per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
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
      getJwtSecret(),
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
      getJwtSecret(),
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

// POST /api/auth/forgot-password
router.post('/forgot-password', loginLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Admin email or username is required.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, email, password FROM admins WHERE email = ? OR username = ? LIMIT 1',
      [email.trim(), email.trim()]
    );

    if (rows.length === 0) {
      // Avoid user enumeration
      return res.json({
        success: true,
        message: 'If an admin account matches that email, reset instructions have been sent.',
      });
    }

    const admin = rows[0];
    const resetSecret = getJwtSecret() + admin.password;
    const resetToken = jwt.sign(
      { id: admin.id, email: admin.email, type: 'admin_password_reset' },
      resetSecret,
      { expiresIn: '1h' }
    );

    let emailSent = false;
    try {
      const { sendAdminPasswordResetEmail } = await import('../services/emailService.js');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/admin/login?reset_token=${resetToken}&email=${encodeURIComponent(admin.email)}`;
      const mailRes = await sendAdminPasswordResetEmail({
        email: admin.email,
        username: admin.username,
        resetLink,
        resetToken,
      });
      emailSent = mailRes?.sent || false;
    } catch (err) {
      console.warn('⚠️ Could not send reset email:', err.message);
    }

    return res.json({
      success: true,
      message: emailSent
        ? 'Password reset instructions have been sent to your email.'
        : 'Password reset request received. (If SMTP is not yet configured, you may reset using the token below).',
      emailSent,
      // Provide devToken when SMTP is not configured or in local dev
      devToken: !emailSent ? resetToken : undefined,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing password reset.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', loginLimiter, async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, reset token, and new password are required.' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, email, password FROM admins WHERE email = ? OR username = ? LIMIT 1',
      [email.trim(), email.trim()]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid admin account.' });
    }

    const admin = rows[0];
    const resetSecret = getJwtSecret() + admin.password;

    try {
      const decoded = jwt.verify(token, resetSecret);
      if (decoded.type !== 'admin_password_reset' || decoded.id !== admin.id) {
        return res.status(400).json({ success: false, message: 'Invalid reset token.' });
      }
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Reset token has expired or is invalid.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password = ? WHERE id = ?', [hashed, admin.id]);

    return res.json({
      success: true,
      message: 'Admin password has been reset successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Server error resetting password.' });
  }
});

export default router;
