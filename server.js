import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { testConnection } from './config/db.js';
import { initializeDatabase } from './config/initDb.js';
import { generateSeoFiles } from './services/seoGenerator.js';

import authRoutes from './routes/authRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import pagesRoutes from './routes/pagesRoutes.js';
import storesRoutes from './routes/storesRoutes.js';
import blogsRoutes from './routes/blogsRoutes.js';
import campaignsRoutes from './routes/campaignsRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import jobsRoutes from './routes/jobsRoutes.js';
import seoRoutes from './routes/seoRoutes.js';
import heroBannerRoutes from './routes/heroBannerRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads directory & fallback
const uploadsRoot = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsRoot));

// Fallback: If an old flat /uploads/:filename is requested, check if it resides in any structured subfolder
app.use('/uploads/:filename', (req, res, next) => {
  const { filename } = req.params;
  if (!filename) return next();
  const subfolders = ['blogs', 'stores', 'jobs', 'flyers', 'hero-banners'];
  for (const sub of subfolders) {
    const candidate = path.join(uploadsRoot, sub, filename);
    if (fs.existsSync(candidate)) {
      return res.sendFile(candidate);
    }
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// SEO Direct Endpoints (Sitemap, Robots, LLMs.txt, AEO, GEO)
app.use('/', seoRoutes);
app.use('/api/seo', seoRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/blogs', blogsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/hero-banners', heroBannerRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

async function startServer() {
  try {
    await testConnection();
    await initializeDatabase();
    await generateSeoFiles().catch((err) => console.warn('Startup SEO generation warning:', err.message));

    app.listen(PORT, () => {
      console.log(`🚀 Market Backend Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
