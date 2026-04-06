require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

async function runMigrations() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database for migrations.');

    // 1. Create migrations_log table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Get list of files in database/migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    // 3. Check already applied migrations
    const { rows } = await client.query('SELECT migration_name FROM migrations_log');
    const appliedMigrations = new Set(rows.map(r => r.migration_name));

    // 4. Apply pending migrations
    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`- Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`🚀 Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations_log (migration_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Success: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed: ${file}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('🏁 All migrations up to date.');
  } catch (err) {
    console.error('❌ Migration runner error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
