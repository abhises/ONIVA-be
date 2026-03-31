const { Client } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_7V8xHrzdAbmD@ep-flat-credit-aju89gir-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require";

async function run() {
  console.log("Connecting to Production Database (Neon)...");
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Common for Neon if sslmode=require but certs are not provided locally
  });

  try {
    await client.connect();
    console.log("Connected successfully.");

    process.on('SIGINT', async () => {
      console.log('Cancelling migration...');
      await client.end();
      process.exit();
    });

    console.log("Running migration: ADD COLUMN profile_photo TO users...");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT");
    console.log("✅ Column added successfully.");

    console.log("Verifying migration...");
    const check = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_photo'");
    if (check.rows.length > 0) {
      console.log("✅ Verification passed: Column profile_photo exists in users table.");
    } else {
      console.log("❌ Verification failed: Column profile_photo not found.");
    }

  } catch (err) {
    console.error("❌ Migration failed:");
    console.error(err.message);
  } finally {
    await client.end();
    console.log("Disconnected.");
    process.exit(0);
  }
}

run();
