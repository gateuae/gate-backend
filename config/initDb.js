import pool from './db.js';
import bcrypt from 'bcryptjs';

export async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    console.log('🚀 Checking and initializing MySQL tables...');

    // 1. Admins Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Site Settings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Stores Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(100) NOT NULL,
        hours VARCHAR(100) NOT NULL,
        open_hour INT DEFAULT 8,
        close_hour INT DEFAULT 24,
        highlights JSON,
        coords JSON,
        image VARCHAR(255),
        image_alt VARCHAR(255) DEFAULT '',
        tagline TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Blogs Table (with stack, image_alt, SEO fields)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(150) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        stack VARCHAR(255) DEFAULT '',
        date VARCHAR(50) NOT NULL,
        read_time VARCHAR(50) NOT NULL,
        image VARCHAR(255) NOT NULL,
        image_alt VARCHAR(255) DEFAULT '',
        excerpt TEXT NOT NULL,
        body LONGTEXT NOT NULL,
        meta_title VARCHAR(255) DEFAULT '',
        meta_description TEXT,
        meta_keywords TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Campaigns Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        season VARCHAR(255) NOT NULL,
        blurb TEXT NOT NULL,
        cover VARCHAR(255) NOT NULL,
        cover_alt VARCHAR(255) DEFAULT '',
        branches JSON,
        pages LONGTEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Pages Content (CMS for main points of each page)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pages_content (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_name VARCHAR(50) UNIQUE NOT NULL,
        content_json LONGTEXT NOT NULL,
        meta_title VARCHAR(255) DEFAULT '',
        meta_description TEXT,
        meta_keywords TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Contact Inquiries Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL,
        branch VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Jobs Table (Careers)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(150) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100) NOT NULL,
        location VARCHAR(150) NOT NULL,
        job_type VARCHAR(50) NOT NULL DEFAULT 'Full-Time',
        experience_level VARCHAR(100) NOT NULL DEFAULT '1 - 2 Years',
        salary_range VARCHAR(100) DEFAULT '',
        openings INT DEFAULT 1,
        deadline VARCHAR(50) DEFAULT '',
        description LONGTEXT NOT NULL,
        responsibilities JSON,
        requirements JSON,
        benefits JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_jobs_active_created (is_active, created_at),
        INDEX idx_jobs_department (department)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure performance indexes exist if table was already created
    try {
      const [existingIndexes] = await connection.query(`SHOW INDEX FROM jobs WHERE Key_name = 'idx_jobs_active_created'`);
      if (existingIndexes.length === 0) {
        await connection.query(`CREATE INDEX idx_jobs_active_created ON jobs (is_active, created_at)`);
      }
    } catch {
      // Table might not exist yet or index already present
    }


    // 9. Job Applications Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        job_title VARCHAR(255) NOT NULL,
        applicant_name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        current_city VARCHAR(100) DEFAULT '',
        experience_years VARCHAR(50) DEFAULT '',
        notice_period VARCHAR(50) DEFAULT 'Immediate',
        resume_url VARCHAR(255) NOT NULL,
        cover_note TEXT,
        linkedin_url VARCHAR(255) DEFAULT '',
        status VARCHAR(50) DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_job_id (job_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Hero Banners Table (Desktop & Mobile Hero Images with Alt text)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS hero_banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        desktop_image VARCHAR(255) NOT NULL,
        desktop_alt VARCHAR(255) DEFAULT '',
        mobile_image VARCHAR(255) NOT NULL,
        mobile_alt VARCHAR(255) DEFAULT '',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default admin if not exists
    const [adminRows] = await connection.query('SELECT id FROM admins LIMIT 1');
    if (adminRows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO admins (username, email, password) VALUES (?, ?, ?)',
        ['admin', 'marketing@gateuae.com', hashedPassword]
      );
      console.log('👤 Created default admin user: admin@gatehypermarket.ae (password: admin123)');
    }

    // Note: Predefined seed data has been completely removed.

    // Note: Predefined mock seed data (stores, blogs, campaigns, jobs, hero banners) has been removed.
    // All records now originate solely from user input via the Admin Dashboard and database.

    console.log('🎉 Database initialization complete!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}
