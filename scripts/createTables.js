require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');


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


async function createTables() {
  try {
    console.log('📦 Connecting to database...');
    const sql = fs.readFileSync(
      path.join(__dirname, '../database/schema.sql'),
      'utf8'
    );

    await pool.query(sql);

    console.log('✅ Tables created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create tables:', error);
    process.exit(1);
  }
}

createTables();
