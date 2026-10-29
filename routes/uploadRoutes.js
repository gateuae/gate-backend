import express from 'express';
import { upload, resolveUploadSubfolder } from '../middleware/upload.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { uploadToUploadThing, uploadMultipleToUploadThing } from '../services/uploadthingService.js';

const router = express.Router();

// POST /api/upload - Upload single image (supports ?folder=blogs|stores|flyers|jobs|hero-banners)
router.post('/', authenticateAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    try {
      const subfolder = resolveUploadSubfolder(req) || 'general';
      const result = await uploadToUploadThing(req.file, subfolder);
      return res.json({
        success: true,
        message: 'File uploaded successfully.',
        url: result.url,
        filename: result.filename,
        key: result.key,
        provider: result.provider,
        subfolder,
      });
    } catch (uploadErr) {
      console.error('Upload error:', uploadErr);
      return res.status(500).json({
        success: false,
        message: uploadErr.message || 'Failed to process file upload.',
      });
    }
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
    upload.array('images', 60)(req, res, async (err) => {
      if (err) {
        console.error('Multiple upload error:', err);
        return res.status(400).json({ success: false, message: err.message || 'Multiple upload failed.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files received for upload.' });
      }

      try {
        const subfolder = resolveUploadSubfolder(req) || 'flyers';
        const batchResult = await uploadMultipleToUploadThing(req.files, subfolder);

        return res.json({
          success: true,
          message: batchResult.message || `${batchResult.files.length} file(s) uploaded successfully.`,
          files: batchResult.files,
        });
      } catch (uploadErr) {
        console.error('Multiple upload error:', uploadErr);
        return res.status(500).json({
          success: false,
          message: uploadErr.message || 'Failed to upload multiple files.',
        });
      }
    });
  }
);

export default router;
