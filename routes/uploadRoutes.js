import express from 'express';
import { upload, getFileUrl, setUploadFolder } from '../middleware/upload.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/upload - Upload single image (supports ?folder=blogs|stores|flyers|jobs|hero-banners)
router.post('/', authenticateAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const fileUrl = getFileUrl(req.file);
    return res.json({
      success: true,
      message: 'File uploaded successfully.',
      url: fileUrl,
      filename: req.file.filename,
      subfolder: req.file.subfolder || '',
    });
  });
});

// POST /api/upload/multiple - Upload multiple images (flyer pages, defaults to 'flyers' subfolder)
router.post(
  '/multiple',
  authenticateAdmin,
  (req, res, next) => {
    if (!req.query.folder && !req.uploadFolder) {
      req.uploadFolder = 'flyers';
    }
    next();
  },
  (req, res) => {
    upload.array('images', 60)(req, res, (err) => {
      if (err) {
        console.error('Multiple upload error:', err);
        return res.status(400).json({ success: false, message: err.message || 'Multiple upload failed.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files received for upload.' });
      }

      const files = req.files.map((f, idx) => ({
        url: getFileUrl(f),
        filename: f.filename,
        originalname: f.originalname,
        page_number: idx + 1,
        subfolder: f.subfolder || 'flyers',
      }));

      return res.json({
        success: true,
        message: `${files.length} file(s) uploaded successfully.`,
        files,
      });
    });
  }
);

export default router;
