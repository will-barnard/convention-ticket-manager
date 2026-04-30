require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedSuperAdminUser() {
  console.log('Checking for default superadmin user...');

  const hashedPassword = await bcrypt.hash('superadmin123', 10);

  const result = await db.query(
    `INSERT INTO users (username, password, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    ['superadmin', hashedPassword, 'superadmin']
  );

  if (result.rowCount > 0) {
    console.log('✓ Default superadmin user created');
    console.log('  Username: superadmin');
    console.log('  Password: superadmin123');
    console.log('  ⚠️  Please change the password after first login!');
  } else {
    console.log('✓ SuperAdmin user already exists');
  }
}

module.exports = { seedSuperAdminUser };

if (require.main === module) {
  seedSuperAdminUser()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding superadmin user:', error);
      process.exit(1);
    });
}
