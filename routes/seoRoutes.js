import express from 'express';
import { generateSeoFiles } from '../services/seoGenerator.js';

const router = express.Router();

let cachedSeoData = null;
let lastGeneratedAt = null;

export function invalidateSeoCache() {
  cachedSeoData = null;
  lastGeneratedAt = null;
}

// Helper to get or generate SEO files
async function getSeoPayload(force = false) {
  // Regenerate if no cache or older than 5 minutes or forced
  const now = Date.now();
  if (force || !cachedSeoData || !lastGeneratedAt || now - lastGeneratedAt > 5 * 60 * 1000) {
    cachedSeoData = await generateSeoFiles();
    lastGeneratedAt = now;
  }
  return cachedSeoData;
}

// 1. SITEMAP.XML
router.get('/sitemap.xml', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'application/xml; charset=utf-8');
    return res.send(data.sitemapXml);
  } catch (err) {
    console.error('Error serving sitemap.xml:', err);
    res.status(500).send('Error generating sitemap.xml');
  }
});

// 2. ROBOTS.TXT
router.get('/robots.txt', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'text/plain; charset=utf-8');
    return res.send(data.robotsTxt);
  } catch (err) {
    console.error('Error serving robots.txt:', err);
    res.status(500).send('Error generating robots.txt');
  }
});

// 3. LLMS.TXT
router.get('/llms.txt', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'text/plain; charset=utf-8');
    return res.send(data.llmsTxt);
  } catch (err) {
    console.error('Error serving llms.txt:', err);
    res.status(500).send('Error generating llms.txt');
  }
});

// 4. LLMS-FULL.TXT
router.get('/llms-full.txt', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'text/plain; charset=utf-8');
    return res.send(data.llmsFullTxt);
  } catch (err) {
    console.error('Error serving llms-full.txt:', err);
    res.status(500).send('Error generating llms-full.txt');
  }
});

// 5. AEO.JSON
router.get('/aeo.json', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'application/ld+json; charset=utf-8');
    return res.json(data.aeoData);
  } catch (err) {
    console.error('Error serving aeo.json:', err);
    res.status(500).json({ error: 'Error generating AEO schema' });
  }
});

// 6. GEO.JSON
router.get('/geo.json', async (req, res) => {
  try {
    const data = await getSeoPayload();
    res.header('Content-Type', 'application/geo+json; charset=utf-8');
    return res.json(data.geoData);
  } catch (err) {
    console.error('Error serving geo.json:', err);
    res.status(500).json({ error: 'Error generating GeoJSON' });
  }
});

// 7. MANUAL REGENERATE (API trigger)
router.post('/regenerate', async (req, res) => {
  try {
    const data = await getSeoPayload(true);
    return res.json({
      success: true,
      message: 'All SEO, AEO, and GEO files regenerated successfully from database.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error in /api/seo/regenerate:', err);
    res.status(500).json({ success: false, message: 'Failed to regenerate SEO files.' });
  }
});

export default router;
