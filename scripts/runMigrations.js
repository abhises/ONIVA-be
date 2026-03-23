require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Use your existing connection logic
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


async function applyMigration() {
  try {
    console.log('🚀 Starting Migration...');
    
    // Read the migration file specifically
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../database/migration_v2.sql'),
      'utf8'
    );

    await pool.query(migrationSql);

    console.log('✅ Migration applied successfully! VARCHAR columns are now TEXT.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();