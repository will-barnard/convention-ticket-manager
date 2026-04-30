require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedVerifier() {
  console.log('Checking for default verifier user...');

  const hashedPassword = await bcrypt.hash('verifier123', 10);

  const result = await db.query(
    `INSERT INTO users (username, password, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    ['verifier', hashedPassword, 'verifier']
  );

  if (result.rowCount > 0) {
    console.log('✓ Default verifier user created');
    console.log('  Username: verifier');
    console.log('  Password: verifier123');
    console.log('  ⚠️  Please change the password after first login!');
  } else {
    console.log('✓ Verifier user already exists');
  }
}

module.exports = { seedVerifier };

if (require.main === module) {
  seedVerifier()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding verifier:', error);
      process.exit(1);
    });
}
