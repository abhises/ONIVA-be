/**
 * Database Configuration
 * PostgreSQL with connection pooling
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'oniva_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

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