const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const checkLockdown = require('../middleware/lockdown');

const router = express.Router();

// Helper function to get current date in a specific timezone (YYYY-MM-DD format)
function getDateInTimezone(timezone) {
  const now = new Date();
  // Convert to the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

// Helper function to format a date to UTC YYYY-MM-DD
function formatDateUTC(date) {
  if (!date) return null;
  return new Date(date).toISOString().split('T')[0];
}

// Helper function to get allowed days for an attendee ticket subtype
function getAllowedDays(subtype) {
  const dayMapping = {
    'vip': ['friday', 'saturday', 'sunday'],
    'adult_2day': ['saturday', 'sunday'],
    'adult_saturday': ['saturday'],
    'adult_sunday': ['sunday'],
    'child_2day': ['saturday', 'sunday'],
    'child_saturday': ['saturday'],
    'child_sunday': ['sunday']
  };
  return dayMapping[subtype] || [];
}

// Helper function to check if today (in convention timezone) matches any of the allowed convention dates
async function checkDateValidity(allowedDays) {
  const settingsResult = await db.query('SELECT friday_date, saturday_date, sunday_date, timezone FROM settings LIMIT 1');
  
  if (settingsResult.rows.length === 0) {
    return { valid: false, message: 'Convention dates not configured in settings' };
  }
  
  const settings = settingsResult.rows[0];
  const timezone = settings.timezone || 'America/Chicago'; // Default to Chicago if not set
  const todayInConventionTimezone = getDateInTimezone(timezone); // Current date in convention's timezone
  
  const dateMapping = {
    'friday': settings.friday_date,
    'saturday': settings.saturday_date,
    'sunday': settings.sunday_date
  };
  
  for (const day of allowedDays) {
    const conventionDate = dateMapping[day];
    if (conventionDate) {
      const dateStrUTC = formatDateUTC(conventionDate);
      if (dateStrUTC === todayInConventionTimezone) {
        return { valid: true, day: day };
      }
    }
  }
  
  return { 
    valid: false, 
    message: `This ticket is only valid on: ${allowedDays.join(', ')}`,
    allowedDays: allowedDays 
  };
}

// Verify ticket by UUID (protected endpoint - requires authentication)
router.get('/:uuid', authMiddleware, checkLockdown, async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find ticket
    const ticketResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, is_used, status FROM tickets WHERE uuid = $1',
      [uuid]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        status: 'invalid',
        message: 'Ticket not found',
      });
    }

    const ticket = ticketResult.rows[0];

    // Check ticket status - reject if not valid
    if (ticket.status !== 'valid') {
      return res.status(400).json({
        status: 'invalid_status',
        message: ticket.status === 'refunded' ? 'This ticket has been refunded and is no longer valid' : 
                ticket.status === 'chargeback' ? 'This ticket has been charged back and is no longer valid' :
                'This ticket has been marked as invalid',
        ticketType: ticket.ticket_type,
        ticketSubtype: ticket.ticket_subtype,
        name: ticket.name,
        ticketStatus: ticket.status,
      });
    }

    // For attendee tickets, validate date and check if already scanned
    if (ticket.ticket_type === 'attendee') {
      // First, check if today is an allowed day for this ticket
      const allowedDays = getAllowedDays(ticket.ticket_subtype);
      const dateCheck = await checkDateValidity(allowedDays);
      
      if (!dateCheck.valid) {
        return res.status(400).json({
          status: 'wrong_date',
          message: dateCheck.message,
          allowedDays: dateCheck.allowedDays,
          ticketType: ticket.ticket_type,
          ticketSubtype: ticket.ticket_subtype,
          name: ticket.name,
        });
      }
      
      // Check if ticket has already been scanned (ever)
      const scanCheckResult = await db.query(
        'SELECT id, scan_date FROM ticket_scans WHERE ticket_id = $1 LIMIT 1',
        [ticket.id]
      );
      
      if (scanCheckResult.rows.length > 0) {
        const scannedDate = formatDateUTC(scanCheckResult.rows[0].scan_date);
        return res.status(400).json({
          status: 'already_scanned',
          message: 'This ticket has already been scanned. Wristband should have been issued.',
          scannedOn: scannedDate,
          ticketType: ticket.ticket_type,
          ticketSubtype: ticket.ticket_subtype,
          name: ticket.name,
        });
      }
      
      // Record the scan with current date in convention timezone and scanner user
      const settingsResult = await db.query('SELECT timezone FROM settings LIMIT 1');
      const timezone = settingsResult.rows[0]?.timezone || 'America/Chicago';
      const todayInConventionTimezone = getDateInTimezone(timezone);
      await db.query(
        'INSERT INTO ticket_scans (ticket_id, scan_date, scanned_by_user_id) VALUES ($1, $2, $3)',
        [ticket.id, todayInConventionTimezone, req.user.id]
      );
      
      return res.json({
        status: 'valid',
        message: 'Access granted - Issue wristband for re-entry',
        ticketType: ticket.ticket_type,
        ticketSubtype: ticket.ticket_subtype,
        name: ticket.name,
      });
    }

    // For student and exhibitor tickets, use the old logic (single-use)
    // Check if already used
    if (ticket.is_used) {
      return res.status(400).json({
        status: 'already_used',
        message: 'This ticket has already been used',
        ticketType: ticket.ticket_type,
        name: ticket.name,
      });
    }

    // Get supplies if exhibitor ticket
    let supplies = null;
    if (ticket.ticket_type === 'exhibitor') {
      const suppliesResult = await db.query(
        'SELECT supply_name, quantity FROM ticket_supplies WHERE ticket_id = $1',
        [ticket.id]
      );
      supplies = suppliesResult.rows.map(s => ({
        name: s.supply_name,
        quantity: s.quantity
      }));
    }

    // Mark ticket as used
    await db.query(
      'UPDATE tickets SET is_used = true, used_at = NOW() WHERE id = $1',
      [ticket.id]
    );

    res.json({
      status: 'valid',
      message: 'Access granted to the convention',
      ticketType: ticket.ticket_type,
      name: ticket.name,
      teacherName: ticket.teacher_name,
      supplies: supplies,
    });
  } catch (error) {
    console.error('Error verifying ticket:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error',
    });
  }
});

module.exports = router;
