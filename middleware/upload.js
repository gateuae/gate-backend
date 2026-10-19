import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const uploadDir = path.join(__dirname, '..', 'uploads');

export const ALLOWED_UPLOAD_FOLDERS = ['blogs', 'stores', 'jobs', 'flyers', 'hero-banners'];

// Ensure base upload directory and all subdirectories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

for (const sub of ALLOWED_UPLOAD_FOLDERS) {
  const subPath = path.join(uploadDir, sub);
  if (!fs.existsSync(subPath)) {
    fs.mkdirSync(subPath, { recursive: true });
  }
}

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

  return '';
}

export function getFileUrl(file) {
  if (!file) return '';
  const sub = file.subfolder;
  return sub ? `/uploads/${sub}/${file.filename}` : `/uploads/${file.filename}`;
}

export const setUploadFolder = (folder) => (req, res, next) => {
  req.uploadFolder = folder;
  next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = resolveUploadSubfolder(req);
    file.subfolder = subfolder;
    const targetDir = subfolder ? path.join(uploadDir, subfolder) : uploadDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

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
    cb(new Error(`File "${file.originalname}" is not an accepted image (JPEG, PNG, WebP, GIF, SVG).`), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit per flyer image
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
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});
