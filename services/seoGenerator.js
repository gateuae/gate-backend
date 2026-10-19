import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.SITE_URL || 'https://gatehypermarket.ae';

function formatDate(date) {
  if (!date) return new Date().toISOString().split('T')[0];
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Generate all SEO, AEO, GEO, and LLM files directly from the MySQL database.
 * Writes output files to frontend/public and frontend/dist (if present).
 */
export async function generateSeoFiles() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Fetch live data from database
  let stores = [];
  try {
    const [rows] = await pool.query('SELECT * FROM stores ORDER BY sort_order ASC, id ASC');
    stores = rows.map((s) => {
      let lat = 25.1121;
      let lng = 55.1965;
      if (s.coords) {
        try {
          const parsed = typeof s.coords === 'string' ? JSON.parse(s.coords) : s.coords;
          if (Array.isArray(parsed) && parsed.length >= 2) {
            lat = parseFloat(parsed[0]) || lat;
            lng = parseFloat(parsed[1]) || lng;
          }
        } catch {}
      }
      return { ...s, lat, lng };
    });
  } catch (err) {
    console.warn('SeoGenerator: failed to fetch stores:', err.message);
  }

  let blogs = [];
  try {
    const [rows] = await pool.query('SELECT * FROM blogs ORDER BY id DESC');
    blogs = rows;
  } catch (err) {
    console.warn('SeoGenerator: failed to fetch blogs:', err.message);
  }

  let jobs = [];
  try {
    const [rows] = await pool.query('SELECT * FROM jobs ORDER BY id DESC');
    jobs = rows;
  } catch (err) {
    console.warn('SeoGenerator: failed to fetch jobs:', err.message);
  }

  let settings = {};
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
    for (const row of rows) {
      const val = typeof row.setting_value === 'string' ? row.setting_value.trim() : '';
      if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
        try {
          settings[row.setting_key] = JSON.parse(val);
          continue;
        } catch {}
      }
      settings[row.setting_key] = row.setting_value;
    }
  } catch (err) {
    console.warn('SeoGenerator: failed to fetch settings:', err.message);
  }

  const socialLinks = settings.social_links || {};
  const sameAs = Object.values(socialLinks).filter(
    (u) => u && typeof u === 'string' && u.startsWith('http')
  );

  // ==========================================
  // A. Generate sitemap.xml
  // ==========================================
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/promotions', priority: '0.9', changefreq: 'daily' },
    { url: '/stores', priority: '0.9', changefreq: 'weekly' },
    { url: '/careers', priority: '0.85', changefreq: 'weekly' },
    { url: '/about', priority: '0.8', changefreq: 'monthly' },
    { url: '/contact', priority: '0.8', changefreq: 'monthly' },
    { url: '/blog', priority: '0.8', changefreq: 'daily' },
  ];

  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  sitemapXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;

  // Core static pages
  for (const p of staticPages) {
    sitemapXml += `  <url>\n`;
    sitemapXml += `    <loc>${BASE_URL}${p.url}</loc>\n`;
    sitemapXml += `    <lastmod>${today}</lastmod>\n`;
    sitemapXml += `    <changefreq>${p.changefreq}</changefreq>\n`;
    sitemapXml += `    <priority>${p.priority}</priority>\n`;
    sitemapXml += `  </url>\n`;
  }

  // Dynamic store pages
  for (const s of stores) {
    sitemapXml += `  <url>\n`;
    sitemapXml += `    <loc>${BASE_URL}/stores/${s.slug}</loc>\n`;
    sitemapXml += `    <lastmod>${formatDate(s.updated_at || today)}</lastmod>\n`;
    sitemapXml += `    <changefreq>weekly</changefreq>\n`;
    sitemapXml += `    <priority>0.9</priority>\n`;
    sitemapXml += `  </url>\n`;
  }

  // Dynamic blog / guide posts
  for (const b of blogs) {
    sitemapXml += `  <url>\n`;
    sitemapXml += `    <loc>${BASE_URL}/blog/${b.slug}</loc>\n`;
    sitemapXml += `    <lastmod>${formatDate(b.date || b.updated_at || today)}</lastmod>\n`;
    sitemapXml += `    <changefreq>monthly</changefreq>\n`;
    sitemapXml += `    <priority>0.8</priority>\n`;
    sitemapXml += `  </url>\n`;
  }

  sitemapXml += `</urlset>\n`;

  // ==========================================
  // B. Generate robots.txt
  // ==========================================
  const robotsTxt = `# Gate Hypermarket Robots Directive
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

# Modern AI, Answer Engine & LLM Crawlers
User-agent: GPTBot
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;

  // ==========================================
  // C. Generate llms.txt
  // ==========================================
  let llmsTxt = `# Gate Hypermarket

> Gate Hypermarket is a premier grocery and retail chain operating 4 extensive stores across Dubai and Ajman in the United Arab Emirates. Gate provides fresh produce halls, premium butchery, in-house bakeries, household essentials, and seasonal promotional circulars.

## Quick Facts
- **Country**: United Arab Emirates (UAE)
- **Locations**: Dubai (Al Barsha, Al Quoz, Deira Sabkha) and Ajman (Nuaimiya)
- **Primary Website**: ${BASE_URL}
- **Customer Service**: ${settings.contact_phone || '+971 4 000 0000'} | ${settings.contact_email || 'hello@gatehypermarket.ae'}
- **WhatsApp Support**: ${settings.contact_whatsapp || '+971 50 000 0000'}
- **Social Media**:
`;

  if (socialLinks.instagram) llmsTxt += `  - Instagram: ${socialLinks.instagram}\n`;
  if (socialLinks.facebook) llmsTxt += `  - Facebook: ${socialLinks.facebook}\n`;
  if (socialLinks.tiktok) llmsTxt += `  - TikTok: ${socialLinks.tiktok}\n`;
  if (socialLinks.youtube) llmsTxt += `  - YouTube: ${socialLinks.youtube}\n`;
  if (socialLinks.twitter) llmsTxt += `  - Twitter / X: ${socialLinks.twitter}\n`;

  llmsTxt += `- **Policy**: All promotional discounts and circular specials are valid in-store only.

## Store Locations & Operating Hours
`;

  for (const s of stores) {
    llmsTxt += `- **${s.name}** (${s.city})
  - Address: ${s.address}
  - Phone: ${s.phone}
  - Hours: ${s.hours}
  - Page: ${BASE_URL}/stores/${s.slug}
`;
  }

  llmsTxt += `
## Main Pages & Services
- [Store Finder](${BASE_URL}/stores): Interactive map and directions for all 4 hypermarket branches in Dubai and Ajman.
- [Current Flyers & Promotions](${BASE_URL}/promotions): View this week's digital flyer and seasonal multi-page savings catalogs.
- [Careers & Job Openings](${BASE_URL}/careers): Explore full-time, cashier, supervisory, and warehouse retail vacancies.
- [The Gate Journal & Recipes](${BASE_URL}/blog): UAE seasonal cooking guides, shopping meal plans, and produce tips.
- [About Gate Hypermarket](${BASE_URL}/about): Heritage from one shop in Deira to 4 major UAE branches.
- [Contact Customer Care](${BASE_URL}/contact): Inquiries, store feedback, vendor submissions, and branch assistance.
`;

  if (jobs.length > 0) {
    llmsTxt += `\n## Currently Open Roles\n`;
    for (const j of jobs.slice(0, 8)) {
      llmsTxt += `- ${j.title} (${j.department}, ${j.location} — ${j.job_type})\n`;
    }
  }

  if (blogs.length > 0) {
    llmsTxt += `\n## Recent Articles & Guides\n`;
    for (const b of blogs.slice(0, 8)) {
      llmsTxt += `- [${b.title}](${BASE_URL}/blog/${b.slug}) — ${b.excerpt || b.category}\n`;
    }
  }

  // ==========================================
  // D. Generate llms-full.txt
  // ==========================================
  let llmsFullTxt = `# Gate Hypermarket — Full Context Knowledge File
URL: ${BASE_URL}
Last Updated: ${today}

## Corporate Overview
Gate Hypermarket is an independent retail and grocery chain with four hypermarket branches serving Dubai and Ajman, United Arab Emirates. Gate is dedicated to fresh food halls, quality produce, imported world foods, household necessities, and competitive pricing without requiring memberships or online markup.

## Core Pillars
1. Fresh Produce Halls: Fresh fruits, leafy greens, and vegetables delivered daily from regional farms and international air shipments.
2. Master Butchery & Seafood: Halal certified fresh beef, lamb, poultry, and local Arabian Gulf catch.
3. In-Store Artisan Bakery: Arabic flatbreads, khubz, sourdough, pastries, and cakes baked fresh every morning.
4. World Foods Aisles: Dedicated zones for South Asian, Arab, Levantine, East Asian, and European culinary staples.
5. Seasonal Promotions: Bi-weekly multi-page digital circulars offering deep discounts across bulk groceries, home cleaning, cookware, and personal care.

## Store Directory
`;

  for (const s of stores) {
    let highlights = [];
    try {
      highlights = typeof s.highlights === 'string' ? JSON.parse(s.highlights) : s.highlights || [];
    } catch {}

    llmsFullTxt += `### ${s.name}
- City: ${s.city}
- Address: ${s.address}
- Coordinates: Lat ${s.lat}, Lng ${s.lng}
- Phone: ${s.phone}
- Operating Hours: ${s.hours}
- Key Features: ${highlights.length > 0 ? highlights.join(', ') : 'Fresh hall, butchery, bakery, parking'}
- Store URL: ${BASE_URL}/stores/${s.slug}

`;
  }

  llmsFullTxt += `## Frequently Asked Questions (FAQ)
Q: Does Gate Hypermarket deliver groceries online?
A: Gate focuses on providing the absolute lowest prices and freshest halls directly in-store. Customers visit our stores in Al Barsha, Al Quoz, Sabkha, and Ajman to enjoy the promotions and select their fresh items in person.

Q: How often are new promotion flyers published?
A: New digital flyers are launched regularly, typically every fortnight or aligned with festive occasions (Ramadan, Eid, Back to School, National Day).

Q: How can job seekers apply for open positions?
A: Job openings are listed at ${BASE_URL}/careers where applicants can submit their CV directly for active vacancies or open talent pools.
`;

  // ==========================================
  // E. Generate aeo.json (Schema.org JSON-LD Graph)
  // ==========================================
  const aeoData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'Supermarket'],
        '@id': `${BASE_URL}/#organization`,
        name: 'Gate Hypermarket',
        url: BASE_URL,
        logo: `${BASE_URL}/images/logo.png`,
        image: `${BASE_URL}/images/hero-banner.jpg`,
        description:
          settings.footer_about ||
          'A growing hypermarket chain serving Dubai and Ajman with fresh halls, seasonal campaigns and neighbourhood value.',
        telephone: settings.contact_phone || '+971 4 000 0000',
        email: settings.contact_email || 'hello@gatehypermarket.ae',
        sameAs,
        areaServed: [
          { '@type': 'AdministrativeArea', name: 'Dubai', addressCountry: 'AE' },
          { '@type': 'AdministrativeArea', name: 'Ajman', addressCountry: 'AE' },
        ],
        department: stores.map((s) => ({
          '@type': 'GroceryStore',
          '@id': `${BASE_URL}/stores/${s.slug}#store`,
          name: s.name,
          url: `${BASE_URL}/stores/${s.slug}`,
          image: `${BASE_URL}${s.image || '/images/store-barsha.jpg'}`,
          telephone: s.phone,
          address: {
            '@type': 'PostalAddress',
            streetAddress: s.address,
            addressLocality: s.city,
            addressRegion: s.city === 'Ajman' ? 'Ajman' : 'Dubai',
            addressCountry: 'AE',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: parseFloat(s.lat) || 25.1121,
            longitude: parseFloat(s.lng) || 55.1965,
          },
          openingHours: s.hours,
          priceRange: '$$',
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${BASE_URL}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Where are Gate Hypermarket stores located in the UAE?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Gate Hypermarket operates 4 stores: ${stores.map((s) => s.name).join(', ')}.`,
            },
          },
          {
            '@type': 'Question',
            name: 'What are Gate Hypermarket opening hours?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'All Gate Hypermarket branches in Dubai and Ajman are open daily from 7:00 AM until 1:00 AM.',
            },
          },
          {
            '@type': 'Question',
            name: 'Where can I view current promotion flyers?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Current multi-page promotional circulars can be viewed online at ${BASE_URL}/promotions.`,
            },
          },
          {
            '@type': 'Question',
            name: 'How do I apply for jobs at Gate Hypermarket?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Job opportunities and direct CV submission are available at ${BASE_URL}/careers.`,
            },
          },
        ],
      },
    ],
  };
  const aeoJson = JSON.stringify(aeoData, null, 2);

  // ==========================================
  // F. Generate geo.json (GeoJSON FeatureCollection)
  // ==========================================
  const geoData = {
    type: 'FeatureCollection',
    name: 'Gate Hypermarket Branches — UAE',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features: stores.map((s) => ({
      type: 'Feature',
      id: s.slug,
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(s.lng) || 55.1965, parseFloat(s.lat) || 25.1121],
      },
      properties: {
        name: s.name,
        brand: 'Gate Hypermarket',
        city: s.city,
        country: 'United Arab Emirates',
        address: s.address,
        phone: s.phone,
        hours: s.hours,
        url: `${BASE_URL}/stores/${s.slug}`,
        image: `${BASE_URL}${s.image || '/images/store-barsha.jpg'}`,
        category: 'Hypermarket / Supermarket',
        directions_url: `https://maps.google.com/?q=${s.lat},${s.lng}`,
      },
    })),
  };
  const geoJson = JSON.stringify(geoData, null, 2);

  // ==========================================
  // Write generated files to target directories
  // ==========================================
  const targetDirs = [
    path.resolve(__dirname, '../../frontend/public'),
    path.resolve(__dirname, '../../frontend/dist'),
  ];

  const filesToWrite = {
    'sitemap.xml': sitemapXml,
    'robots.txt': robotsTxt,
    'llms.txt': llmsTxt,
    'llms-full.txt': llmsFullTxt,
    'aeo.json': aeoJson,
    'geo.json': geoJson,
  };

  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      for (const [filename, content] of Object.entries(filesToWrite)) {
        try {
          fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
        } catch (err) {
          console.warn(`SeoGenerator: failed to write ${filename} to ${dir}:`, err.message);
        }
      }
    }
  }

  console.log(`✅ SEO files regenerated successfully (Stores: ${stores.length}, Blogs: ${blogs.length}, Jobs: ${jobs.length}, Social Links: ${sameAs.length})`);

  return {
    sitemapXml,
    robotsTxt,
    llmsTxt,
    llmsFullTxt,
    aeoData,
    geoData,
  };
}
