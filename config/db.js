import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

function getDbConfig(customHost = null) {
  return {
    host: customHost || process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || 'super_market',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

let activeConfig = getDbConfig();
let currentPool = mysql.createPool(activeConfig);

// Proxy delegates all pool methods (query, getConnection, execute, etc.) to the active pool
const pool = new Proxy({}, {
  get(target, prop) {
    if (typeof currentPool[prop] === 'function') {
      return currentPool[prop].bind(currentPool);
    }
    return currentPool[prop];
  },
});

export async function testConnection() {
  // Always refresh .env configuration from disk so edits are picked up immediately without restarting
  dotenv.config({ path: envPath, override: true });

  const primaryHost = process.env.DB_HOST || 'localhost';
  const candidateHosts = [primaryHost];
  // On Windows/Node, if localhost is configured, also try 127.0.0.1 as a resilient fallback
  if (primaryHost === 'localhost') {
    candidateHosts.push('127.0.0.1');
  } else if (primaryHost === '127.0.0.1') {
    candidateHosts.push('localhost');
  }

  let lastError = null;

  for (const host of candidateHosts) {
    const config = getDbConfig(host);

    try {
      // First verify credentials and auto-create database if it doesn't exist yet
      try {
        const adminConn = await mysql.createConnection({
          host: config.host,
          user: config.user,
          password: config.password,
          port: config.port,
          ssl: config.ssl,
        });

        try {
          await adminConn.query(
            `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
          );
        } catch (dbCreateErr) {
          // Non-fatal if user doesn't have CREATE DATABASE privilege (e.g., restricted GoDaddy user)
        }
        await adminConn.end();
      } catch (adminErr) {
        // If connecting without db fails, continue to pool connection test
      }

      // Create and test the pool with the target database
      const newPool = mysql.createPool(config);
      const conn = await newPool.getConnection();
      conn.release();

      if (currentPool && currentPool !== newPool) {
        currentPool.end().catch(() => {});
      }

      currentPool = newPool;
      activeConfig = config;

      console.log(`✅ Connected to MySQL database "${config.database}" at ${config.host}:${config.port} (user: ${config.user})`);
      return true;
    } catch (err) {
      lastError = err;
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
        break;
      }
    }
  }

  console.error('❌ MySQL connection error:', lastError?.message || 'Unknown error');
  throw lastError;
}

export default pool;
