import multer from 'multer';
import path from 'path';

export const ALLOWED_UPLOAD_FOLDERS = ['blogs', 'stores', 'jobs', 'flyers', 'hero-banners'];

export function resolveUploadSubfolder(req) {
  // 1. Explicit property set by route middleware
  if (req?.uploadFolder && ALLOWED_UPLOAD_FOLDERS.includes(req.uploadFolder.toLowerCase())) {
    return req.uploadFolder.toLowerCase();
  }

  // 2. Query parameter (?folder=blogs, ?folder=stores, etc.)
  if (req?.query?.folder && ALLOWED_UPLOAD_FOLDERS.includes(req.query.folder.toLowerCase())) {
    return req.query.folder.toLowerCase();
  }

  // 3. Fallback based on route path
  const url = (req?.originalUrl || req?.baseUrl || '').toLowerCase();
  if (url.includes('hero-banner')) return 'hero-banners';
  if (url.includes('job') || url.includes('resume')) return 'jobs';
  if (url.includes('blog')) return 'blogs';
  if (url.includes('store')) return 'stores';
  if (url.includes('flyer') || url.includes('campaign')) return 'flyers';

  return 'general';
}

export function getFileUrl(file) {
  if (!file) return '';
  return file.url || '';
}

export const setUploadFolder = (folder) => (req, res, next) => {
  req.uploadFolder = folder;
  next();
};

// Use in-memory storage so uploads stream directly to UploadThing without touching local disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMime = [
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/x-png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/avif',
    'image/bmp',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.bmp'];

  if (allowedMime.includes(file.mimetype.toLowerCase()) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File "${file.originalname}" is not an accepted image format (JPEG, PNG, WebP, GIF, SVG).`), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 32 * 1024 * 1024 }, // 32MB limit per image
});

const resumeFilter = (req, file, cb) => {
  const allowedExts = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, DOCX, RTF, or image resume files are allowed!'), false);
  }
};

export const uploadResume = multer({
  storage,
  fileFilter: resumeFilter,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB limit
});
