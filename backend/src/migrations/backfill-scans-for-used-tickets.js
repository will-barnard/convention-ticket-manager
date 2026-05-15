require('dotenv').config();
const db = require('../config/database');

async function backfillScansForUsedTickets() {
  try {
    console.log('Backfilling ticket_scans for already-used exhibitor and student tickets...');

    // Find all exhibitor/student tickets marked is_used=true that have no scan record
    const missingScans = await db.query(`
      SELECT t.id, t.ticket_type, t.name, t.used_at
      FROM tickets t
      LEFT JOIN ticket_scans ts ON ts.ticket_id = t.id
      WHERE t.ticket_type IN ('exhibitor', 'student')
        AND t.is_used = true
        AND ts.id IS NULL
    `);

    console.log(`Found ${missingScans.rows.length} ticket(s) to backfill`);

    if (missingScans.rows.length === 0) {
      console.log('Nothing to do.');
      process.exit(0);
    }

    let inserted = 0;
    for (const ticket of missingScans.rows) {
      // Use used_at if available, otherwise fall back to today's date
      const scanDate = ticket.used_at
        ? new Date(ticket.used_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      await db.query(
        'INSERT INTO ticket_scans (ticket_id, scan_date) VALUES ($1, $2)',
        [ticket.id, scanDate]
      );

      console.log(`  ✓ Backfilled scan for ${ticket.ticket_type} ticket #${ticket.id} (${ticket.name}) — scan_date: ${scanDate}`);
      inserted++;
    }

    console.log(`\nDone. Inserted ${inserted} scan record(s).`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

backfillScansForUsedTickets();
