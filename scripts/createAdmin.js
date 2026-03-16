require('dotenv').config();
const { Pool } = require('pg');
// Note: If you use 'bcryptjs' instead of 'bcrypt', change the require below
const bcrypt = require('bcrypt'); 

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

async function createAdminUser() {
  // 1. Define your admin credentials here
  const adminPhone = '9800000000'; // Make sure this is 9-10 digits to pass your API rules later
  const adminName = 'System Admin';
  const adminEmail = 'admin@oniva.com';
  const plainTextPassword = 'SuperSecretAdminPassword123!';

  try {
    console.log('📦 Connecting to database...');

    // 2. Hash the password before saving so the login API can read it
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(plainTextPassword, saltRounds);

    // 3. Insert the admin user into the database
    const query = `
      INSERT INTO users (phone, email, full_name, password_hash, role, status)
      VALUES ($1, $2, $3, $4, 'admin', 'active')
      RETURNING id, phone, email, full_name, role;
    `;

    const values = [adminPhone, adminEmail, adminName, passwordHash];

    const result = await pool.query(query, values);

    console.log('✅ Admin user created successfully!');
    console.table(result.rows[0]);

  } catch (error) {
    // 23505 is the PostgreSQL error code for unique violation (e.g., phone already exists)
    if (error.code === '23505') {
      console.error(`❌ Error: A user with the phone number ${adminPhone} already exists.`);
    } else {
      console.error('❌ Failed to create admin user:', error);
    }
  } finally {
    // Close the connection pool so the script exits automatically
    await pool.end();
  }
}

createAdminUser();