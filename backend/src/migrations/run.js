require('dotenv').config();
const db = require('../config/database');
const path = require('path');

async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_role CHECK (role IN ('admin', 'verifier', 'superadmin'))
      )
    `);
    console.log('✓ Users table created');

    // Add role column if it doesn't exist (for existing tables)
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'role'
        ) THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'admin';
        END IF;
        
        -- Update constraint to include superadmin
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'valid_role' AND table_name = 'users'
        ) THEN
          ALTER TABLE users DROP CONSTRAINT valid_role;
        END IF;
        ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'verifier', 'superadmin'));
      END $$;
    `);
    console.log('✓ Role column ensured');

    // Create tickets table with ticket_type and supplies
    await db.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_type VARCHAR(50) NOT NULL DEFAULT 'student',
        name VARCHAR(255) NOT NULL,
        teacher_name VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        uuid VARCHAR(255) UNIQUE NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_ticket_type CHECK (ticket_type IN ('student', 'exhibitor', 'day_pass'))
      )
    `);
    console.log('✓ Tickets table created');

    // Create supplies table for exhibitor tickets
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_supplies (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        supply_name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Ticket supplies table created');

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_uuid ON tickets(uuid)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(ticket_type)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_supplies_ticket ON ticket_supplies(ticket_id)
    `);
    console.log('✓ Indexes created');

    // Run additional migrations inline to ensure they execute in order
    
    // Add status column and constraint
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tickets' AND column_name = 'status'
        ) THEN
          ALTER TABLE tickets ADD COLUMN status VARCHAR(50) DEFAULT 'valid';
        END IF;
      END $$;
    `);
    console.log('✓ Status column ensured');

    // Update status constraint to include 'cancelled'
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'valid_ticket_status' AND table_name = 'tickets'
        ) THEN
          ALTER TABLE tickets DROP CONSTRAINT valid_ticket_status;
        END IF;
        ALTER TABLE tickets ADD CONSTRAINT valid_ticket_status 
        CHECK (status IN ('valid', 'invalid', 'refunded', 'cancelled', 'chargeback'));
      END $$;
    `);
    console.log('✓ Ticket status constraint updated to include cancelled');

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
