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

    // Add booth_range column for exhibitor tickets
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tickets' AND column_name = 'booth_range'
        ) THEN
          ALTER TABLE tickets ADD COLUMN booth_range VARCHAR(100);
        END IF;
      END $$;
    `);
    console.log('✓ Booth range column ensured');

    // Add quantity column for tickets
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tickets' AND column_name = 'quantity'
        ) THEN
          ALTER TABLE tickets ADD COLUMN quantity INTEGER DEFAULT 1;
        END IF;
      END $$;
    `);
    console.log('✓ Quantity column ensured');
    
    // Make email column nullable
    await db.query(`
      DO $$
      BEGIN
        -- Remove NOT NULL constraint from email column
        ALTER TABLE tickets ALTER COLUMN email DROP NOT NULL;
      END $$;
    `);
    console.log('✓ Email column made nullable');
    
    // Create email send log table for daily rate limiting
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_send_log (
        id SERIAL PRIMARY KEY,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        recipient_email VARCHAR(255) NOT NULL,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        send_type VARCHAR(50) NOT NULL,
        success BOOLEAN DEFAULT true
      )
    `);
    console.log('✓ Email send log table created');

    // Create index on sent_at for efficient daily queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_email_send_log_sent_at 
      ON email_send_log(sent_at)
    `);
    console.log('✓ Email send log index created');
    
    // Add timezone column to settings table
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'settings' AND column_name = 'timezone'
        ) THEN
          ALTER TABLE settings ADD COLUMN timezone VARCHAR(100) DEFAULT 'America/Chicago';
        END IF;
      END $$;
    `);
    console.log('✓ Timezone field added to settings table');

    // Create settings table
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        convention_name VARCHAR(255) NOT NULL DEFAULT 'My Convention',
        logo_url TEXT,
        enable_ticket_cap BOOLEAN DEFAULT FALSE,
        ticket_cap INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Settings table created');

    // Insert default settings if table is empty
    const settingsCount = await db.query('SELECT COUNT(*) FROM settings');
    if (parseInt(settingsCount.rows[0].count) === 0) {
      await db.query(`INSERT INTO settings (convention_name) VALUES ('My Convention')`);
      console.log('✓ Default settings inserted');
    }

    // Create ticket_scans table
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_scans (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scan_date DATE DEFAULT CURRENT_DATE
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_scans_ticket_date
      ON ticket_scans(ticket_id, scan_date)
    `);
    console.log('✓ ticket_scans table created');

    // Create webhook_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        shopify_order_id VARCHAR(255),
        webhook_data JSONB NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        error_message TEXT,
        tickets_created INTEGER DEFAULT 0
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_order_id ON webhook_logs(shopify_order_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed)
    `);
    console.log('✓ webhook_logs table created');

    // add-shopify-order-id: add shopify_order_id to tickets
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'shopify_order_id'
        ) THEN
          ALTER TABLE tickets ADD COLUMN shopify_order_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = 'tickets' AND indexname = 'idx_tickets_shopify_order_id'
        ) THEN
          CREATE INDEX idx_tickets_shopify_order_id ON tickets(shopify_order_id);
        END IF;
      END $$;
    `);
    console.log('✓ shopify_order_id column and index ensured on tickets');

    // add-webhook-type: add webhook_type to webhook_logs
    await db.query(`
      ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS webhook_type VARCHAR(50) DEFAULT 'order_create'
    `);
    console.log('✓ webhook_type column ensured on webhook_logs');

    // add-scanner-user-to-scans
    await db.query(`
      ALTER TABLE ticket_scans
      ADD COLUMN IF NOT EXISTS scanned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_scans_user ON ticket_scans(scanned_by_user_id)
    `);
    console.log('✓ scanned_by_user_id column ensured on ticket_scans');

    // add-lockdown-mode
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'lockdown_mode'
        ) THEN
          ALTER TABLE settings ADD COLUMN lockdown_mode BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);
    console.log('✓ lockdown_mode column ensured on settings');

    // add-receive-mode-fields
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'receive_mode_enabled'
        ) THEN
          ALTER TABLE settings ADD COLUMN receive_mode_enabled BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'receive_mode_secret'
        ) THEN
          ALTER TABLE settings ADD COLUMN receive_mode_secret TEXT;
        END IF;
      END $$;
    `);
    console.log('✓ receive_mode fields ensured on settings');

    // update-settings-for-dates
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'friday_date'
        ) THEN
          ALTER TABLE settings ADD COLUMN friday_date DATE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'saturday_date'
        ) THEN
          ALTER TABLE settings ADD COLUMN saturday_date DATE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'sunday_date'
        ) THEN
          ALTER TABLE settings ADD COLUMN sunday_date DATE;
        END IF;
      END $$;
    `);
    console.log('✓ Date columns ensured on settings');

    // update-settings-for-email-toggle
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'settings' AND column_name = 'auto_send_emails'
        ) THEN
          ALTER TABLE settings ADD COLUMN auto_send_emails BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    console.log('✓ auto_send_emails column ensured on settings');

    // update-tickets-for-attendee-types
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'ticket_subtype'
        ) THEN
          ALTER TABLE tickets ADD COLUMN ticket_subtype VARCHAR(100);
        END IF;
      END $$;
    `);
    await db.query(`UPDATE tickets SET ticket_type = 'attendee' WHERE ticket_type = 'day_pass'`);
    await db.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_ticket_type`);
    await db.query(`
      ALTER TABLE tickets ADD CONSTRAINT valid_ticket_type
      CHECK (ticket_type IN ('student', 'exhibitor', 'attendee'))
    `);
    console.log('✓ ticket_subtype column and attendee constraint ensured');

    // update-tickets-for-email-tracking
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'email_sent'
        ) THEN
          ALTER TABLE tickets ADD COLUMN email_sent BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'email_sent_at'
        ) THEN
          ALTER TABLE tickets ADD COLUMN email_sent_at TIMESTAMP;
        END IF;
      END $$;
    `);
    console.log('✓ email_sent and email_sent_at columns ensured on tickets');

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
