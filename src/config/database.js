/**
 * Database Configuration
 * PostgreSQL with connection pooling
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');


let pool;

switch (process.env.NODE_ENV) {
  case 'production':
    console.log('🔗 Connecting to Production (Neon DB)...');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Neon
      }
    });
    break;

  case 'development':
  default:
    console.log('🔗 Connecting to Local Development Database...');
    pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    break;
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