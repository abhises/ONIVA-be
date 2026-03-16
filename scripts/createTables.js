require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon to accept the connection
  }
});

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
