require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedAdminUser() {
  console.log('Checking for default admin user...');

  // Hash unconditionally — cheap (10 rounds, ~70ms) — so we can use a single
  // race-safe INSERT ... ON CONFLICT DO NOTHING. Two backends booting at the
  // same time during a blue/green swap previously raced: both saw "no admin",
  // both INSERTed, the loser hit a UNIQUE violation and process.exit(1).
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const result = await db.query(
    `INSERT INTO users (username, password)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    ['admin', hashedPassword]
  );

  if (result.rowCount > 0) {
    console.log('✓ Default admin user created');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('  ⚠️  Please change the password after first login!');
  } else {
    console.log('✓ Admin user already exists');
  }
}

module.exports = { seedAdminUser };

if (require.main === module) {
  seedAdminUser()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding admin user:', error);
      process.exit(1);
    });
}
