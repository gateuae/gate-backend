import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import pool, { testConnection } from './config/db.js';
import { initializeDatabase } from './config/initDb.js';
import { generateSeoFiles } from './services/seoGenerator.js';
import { getJwtSecret } from './config/security.js';

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
import { createRouteHandler } from 'uploadthing/express';
import { uploadRouter } from './uploadRouter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Security: Validate JWT secret on startup
try {
  getJwtSecret();
} catch (secErr) {
  console.error('Security initialization warning:', secErr.message);
}

// Security headers with cross-origin media support
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// CORS configuration (Secured & supports GoDaddy preview & custom domains)
const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : []),
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server, health check probes)
    if (!origin) return callback(null, true);

    const isMatch = configuredOrigins.some((allowed) => {
      if (allowed === '*' || origin === allowed) return true;
      try {
        const originUrl = new URL(origin);
        const allowedUrl = new URL(allowed);
        return originUrl.hostname === allowedUrl.hostname;
      } catch {
        return false;
      }
    });

    if (
      isMatch ||
      origin.includes('godaddysites.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection state tracker
let isDatabaseReady = false;
let databaseError = null;

// =========================================================================
// Health Check & Root Endpoints (Crucial for GoDaddy / Cloud / Host Health Probes)
// =========================================================================

// Root path handler (Prevents "Site health check failed" on GoDaddy Deluxe)
const healthHandler = (req, res) => {
  const statusCode = isDatabaseReady ? 200 : 200; // Returns 200 so host probe doesn't kill container while DB connects
  res.status(statusCode).json({
    status: 'ok',
    service: 'Gate Hypermarket API',
    version: '1.0.0',
    database: isDatabaseReady ? 'connected' : (databaseError ? 'error' : 'connecting'),
    databaseMessage: databaseError || (isDatabaseReady ? 'Ready' : 'Initializing'),
    time: new Date().toISOString(),
  });
};

app.all('/', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return healthHandler(req, res);
  }
  next();
});

app.all(['/health', '/api/health'], (req, res) => {
  return healthHandler(req, res);
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

// Mount UploadThing native Express endpoint
const cleanUploadThingToken = process.env.UPLOADTHING_TOKEN
  ? process.env.UPLOADTHING_TOKEN.trim().replace(/^['"]|['"]$/g, '')
  : undefined;

app.use(
  '/api/uploadthing',
  createRouteHandler({
    router: uploadRouter,
    config: {
      token: cleanUploadThingToken,
    },
  })
);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// =========================================================================
// Asynchronous Database Bootstrapping with Graceful Retry
// =========================================================================
async function bootstrapDatabase(retryCount = 0) {
  try {
    await testConnection();
    await initializeDatabase();
    isDatabaseReady = true;
    databaseError = null;
    console.log('✅ Database connected and initialized successfully.');

    // Pre-generate dynamic SEO files
    await generateSeoFiles().catch((err) =>
      console.warn('Startup SEO generation warning:', err.message)
    );
  } catch (err) {
    isDatabaseReady = false;
    databaseError = err.message;
    console.error(`⚠️ Database connection attempt ${retryCount + 1} failed: ${err.message}`);
    console.warn('🔄 Server will remain running and retry connecting to database in 8 seconds...');
    
    // Retry in 8 seconds without crashing the server process
    setTimeout(() => bootstrapDatabase(retryCount + 1), 8000);
  }
}

// Start HTTP server (supports both numeric ports and Passenger/Unix sockets)
const isSocket = typeof PORT === 'string' && isNaN(Number(PORT));
const server = isSocket
  ? app.listen(PORT, () => {
      console.log(`🚀 Gate Hypermarket Backend running on Passenger socket: ${PORT}`);
      bootstrapDatabase();
    })
  : app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Gate Hypermarket Backend running on port ${PORT}`);
      console.log(`📍 Health check ready at http://localhost:${PORT}/ and http://localhost:${PORT}/api/health`);
      bootstrapDatabase();
    });

// Graceful shutdown handling for process managers (GoDaddy, Passenger, Docker, PM2)
const handleShutdown = (signal) => {
  console.log(`Received ${signal}. Gracefully closing HTTP server...`);
  server.close(() => {
    console.log('HTTP server closed.');
    pool.end().finally(() => {
      console.log('MySQL connection pool closed.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
