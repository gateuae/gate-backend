import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { upload, getFileUrl, setUploadFolder } from '../middleware/upload.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Multer middleware for handling both desktop and mobile hero image files
const uploadHeroFields = upload.fields([
  { name: 'desktop_image', maxCount: 1 },
  { name: 'mobile_image', maxCount: 1 },
  { name: 'desktop_file', maxCount: 1 },
  { name: 'mobile_file', maxCount: 1 },
]);

// Helper to safely delete file if it resides in local uploads
function removeLocalUpload(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  if (fileUrl.startsWith('/uploads/')) {
    const relPath = fileUrl.replace('/uploads/', '');
    const fullPath = path.join(uploadsDir, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.warn('Failed to delete old banner image file:', err.message);
      }
    }
  }
}

// -------------------------------------------------------------
// 1. GET /api/hero-banners - Public / Admin list
// -------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { active_only } = req.query;
    let query = 'SELECT * FROM hero_banners';
    const params = [];

    if (active_only === 'true') {
      query += ' WHERE is_active = TRUE';
    }

    query += ' ORDER BY id DESC';

    const [rows] = await pool.query(query, params);
    return res.json({
      success: true,
      banners: rows,
    });
  } catch (error) {
    console.error('Fetch hero banners error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch hero banners.' });
  }
});

// -------------------------------------------------------------
// 2. GET /api/hero-banners/active - Public Active Hero Banner
// -------------------------------------------------------------
router.get('/active', async (req, res) => {
  try {
    let banner = null;

    // 1. Fetch active hero banner
    const [activeRows] = await pool.query(
      'SELECT * FROM hero_banners WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
    );
    if (activeRows.length > 0) {
      banner = activeRows[0];
    }

    // 2. Fallback to any banner in the table
    if (!banner) {
      const [anyRows] = await pool.query('SELECT * FROM hero_banners ORDER BY id DESC LIMIT 1');
      if (anyRows.length > 0) {
        banner = anyRows[0];
      }
    }

    return res.json({
      success: true,
      banner: banner || null,
    });
  } catch (error) {
    console.error('Fetch active hero banner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch active hero banner.' });
  }
});

// -------------------------------------------------------------
// 3. GET /api/hero-banners/:id - Get banner by ID
// -------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM hero_banners WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero banner not found.' });
    }
    return res.json({ success: true, banner: rows[0] });
  } catch (error) {
    console.error('Fetch hero banner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch hero banner.' });
  }
});

// -------------------------------------------------------------
// 4. POST /api/hero-banners/upload - Admin file upload helper
// -------------------------------------------------------------
router.post('/upload', authenticateAdmin, setUploadFolder('hero-banners'), upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const fileUrl = getFileUrl(req.file);
    return res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error('Upload hero banner image error:', error);
    return res.status(500).json({ success: false, message: 'Image upload failed.' });
  }
});

// -------------------------------------------------------------
// 5. POST /api/hero-banners - Create Hero Banner (Admin only)
// -------------------------------------------------------------
router.post('/', authenticateAdmin, setUploadFolder('hero-banners'), uploadHeroFields, async (req, res) => {
  try {
    const { desktop_alt, mobile_alt, is_active } = req.body;

    // Check files uploaded or URL strings passed in body
    let desktopImage = req.body.desktop_image;
    let mobileImage = req.body.mobile_image;

    if (req.files) {
      if (req.files.desktop_image?.[0]) {
        desktopImage = getFileUrl(req.files.desktop_image[0]);
      } else if (req.files.desktop_file?.[0]) {
        desktopImage = getFileUrl(req.files.desktop_file[0]);
      }

      if (req.files.mobile_image?.[0]) {
        mobileImage = getFileUrl(req.files.mobile_image[0]);
      } else if (req.files.mobile_file?.[0]) {
        mobileImage = getFileUrl(req.files.mobile_file[0]);
      }
    }

    if (!desktopImage || !mobileImage) {
      return res.status(400).json({
        success: false,
        message: 'Both Desktop Image and Mobile Image are required for the Hero Banner.',
      });
    }

    const isActiveBool = is_active === undefined ? true : is_active === true || is_active === 'true' || is_active === 1;

    const [result] = await pool.query(
      `INSERT INTO hero_banners (desktop_image, desktop_alt, mobile_image, mobile_alt, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        desktopImage,
        desktop_alt || '',
        mobileImage,
        mobile_alt || '',
        isActiveBool,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Hero banner created successfully.',
      id: result.insertId,
      banner: {
        id: result.insertId,
        desktop_image: desktopImage,
        desktop_alt: desktop_alt || '',
        mobile_image: mobileImage,
        mobile_alt: mobile_alt || '',
        is_active: isActiveBool,
      },
    });
  } catch (error) {
    console.error('Create hero banner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create hero banner.' });
  }
});

// -------------------------------------------------------------
// 6. PUT /api/hero-banners/:id - Update Hero Banner (Admin only)
// -------------------------------------------------------------
router.put('/:id', authenticateAdmin, setUploadFolder('hero-banners'), uploadHeroFields, async (req, res) => {
  try {
    const { id } = req.params;
    const [existingRows] = await pool.query('SELECT * FROM hero_banners WHERE id = ? LIMIT 1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero banner not found.' });
    }
    const current = existingRows[0];

    let desktopImage = req.body.desktop_image || current.desktop_image;
    let mobileImage = req.body.mobile_image || current.mobile_image;

    if (req.files) {
      if (req.files.desktop_image?.[0]) {
        desktopImage = getFileUrl(req.files.desktop_image[0]);
        if (current.desktop_image !== desktopImage) {
          removeLocalUpload(current.desktop_image);
        }
      } else if (req.files.desktop_file?.[0]) {
        desktopImage = getFileUrl(req.files.desktop_file[0]);
        if (current.desktop_image !== desktopImage) {
          removeLocalUpload(current.desktop_image);
        }
      }

      if (req.files.mobile_image?.[0]) {
        mobileImage = getFileUrl(req.files.mobile_image[0]);
        if (current.mobile_image !== mobileImage) {
          removeLocalUpload(current.mobile_image);
        }
      } else if (req.files.mobile_file?.[0]) {
        mobileImage = getFileUrl(req.files.mobile_file[0]);
        if (current.mobile_image !== mobileImage) {
          removeLocalUpload(current.mobile_image);
        }
      }
    }

    const { desktop_alt, mobile_alt, is_active } = req.body;
    const isActiveBool = is_active !== undefined ? is_active === true || is_active === 'true' || is_active === 1 : current.is_active;

    await pool.query(
      `UPDATE hero_banners
       SET desktop_image = ?, desktop_alt = ?,
           mobile_image = ?, mobile_alt = ?,
           is_active = ?
       WHERE id = ?`,
      [
        desktopImage,
        desktop_alt !== undefined ? desktop_alt : current.desktop_alt,
        mobileImage,
        mobile_alt !== undefined ? mobile_alt : current.mobile_alt,
        isActiveBool,
        id,
      ]
    );

    return res.json({
      success: true,
      message: 'Hero banner updated successfully.',
    });
  } catch (error) {
    console.error('Update hero banner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update hero banner.' });
  }
});

// -------------------------------------------------------------
// 7. PATCH /api/hero-banners/:id/toggle - Toggle active status
// -------------------------------------------------------------
router.patch('/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT is_active FROM hero_banners WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero banner not found.' });
    }
    const newStatus = !rows[0].is_active;
    await pool.query('UPDATE hero_banners SET is_active = ? WHERE id = ?', [newStatus, id]);

    return res.json({
      success: true,
      is_active: newStatus,
      message: `Hero banner ${newStatus ? 'activated' : 'deactivated'}.`,
    });
  } catch (error) {
    console.error('Toggle hero banner status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle banner status.' });
  }
});

// -------------------------------------------------------------
// 8. DELETE /api/hero-banners/:id - Delete Hero Banner (Admin only)
// -------------------------------------------------------------
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT desktop_image, mobile_image FROM hero_banners WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hero banner not found.' });
    }

    const { desktop_image, mobile_image } = rows[0];
    await pool.query('DELETE FROM hero_banners WHERE id = ?', [id]);

    // Clean up local disk uploads if applicable
    removeLocalUpload(desktop_image);
    removeLocalUpload(mobile_image);

    return res.json({
      success: true,
      message: 'Hero banner deleted successfully.',
    });
  } catch (error) {
    console.error('Delete hero banner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete hero banner.' });
  }
});

export default router;
