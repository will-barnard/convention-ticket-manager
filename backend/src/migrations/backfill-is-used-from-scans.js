require('dotenv').config();
const db = require('../config/database');

async function backfillIsUsedFromScans() {
  try {
    console.log('Backfilling is_used for tickets that have a scan record but is_used = false...');

    // Find exhibitor/student tickets that have a scan but is_used is still false
    const result = await db.query(`
      SELECT DISTINCT t.id, t.ticket_type, t.name, ts.scan_date
      FROM tickets t
      INNER JOIN ticket_scans ts ON ts.ticket_id = t.id
      WHERE t.ticket_type IN ('exhibitor', 'student')
        AND t.is_used = false
    `);

    console.log(`Found ${result.rows.length} ticket(s) to update`);

    if (result.rows.length === 0) {
      console.log('Nothing to do.');
      process.exit(0);
    }

    let updated = 0;
    for (const ticket of result.rows) {
      await db.query(
        'UPDATE tickets SET is_used = true, used_at = $1 WHERE id = $2',
        [ticket.scan_date, ticket.id]
      );
      console.log(`  ✓ Set is_used=true for ${ticket.ticket_type} ticket #${ticket.id} (${ticket.name})`);
      updated++;
    }

    console.log(`\nDone. Updated ${updated} ticket(s).`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

backfillIsUsedFromScans();
