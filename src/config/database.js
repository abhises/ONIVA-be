/**
 * Database Configuration
 * PostgreSQL with connection pooling
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');


let pool;

// Initialize pool based on available configuration
if (process.env.DATABASE_URL) {
  const isNeon = process.env.DATABASE_URL.includes('neon.tech');
  console.log(`🔗 Connecting to ${isNeon ? 'Neon DB' : 'remote database'} via DATABASE_URL...`);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isNeon || process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false // Required for Neon and typical production DBs
    } : false
  });
} else {
  console.log('🔗 Connecting to Local Development Database...');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'oniva_db',
  });
}


pool.on('connect', () => {
  logger.info('New client connected to database pool');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

const connectDatabase = async () => {
  try {
    const client = await pool.connect();
    logger.info('Successfully connected to PostgreSQL');
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const getPool = () => pool;

const query = (text, params) => {
  return pool.query(text, params);
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  connectDatabase,
  getPool,
  query,
  transaction,
  pool
};