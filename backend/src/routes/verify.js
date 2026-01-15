const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Helper function to get server's current date in UTC YYYY-MM-DD format
function getServerDateUTC() {
  const now = new Date();
  return now.toISOString().split('T')[0];
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

// Helper function to check if today (server time UTC) matches any of the allowed convention dates
async function checkDateValidity(allowedDays) {
  const settingsResult = await db.query('SELECT friday_date, saturday_date, sunday_date FROM settings LIMIT 1');
  
  if (settingsResult.rows.length === 0) {
    return { valid: false, message: 'Convention dates not configured in settings' };
  }
  
  const settings = settingsResult.rows[0];
  const todayUTC = getServerDateUTC(); // Server time in UTC
  
  const dateMapping = {
    'friday': settings.friday_date,
    'saturday': settings.saturday_date,
    'sunday': settings.sunday_date
  };
  
  for (const day of allowedDays) {
    const conventionDate = dateMapping[day];
    if (conventionDate) {
      const dateStrUTC = formatDateUTC(conventionDate);
      if (dateStrUTC === todayUTC) {
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

// Verify ticket by UUID (public endpoint)
router.get('/:uuid', async (req, res) => {
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

    // For attendee tickets, check date restrictions
    if (ticket.ticket_type === 'attendee') {
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
      
      // Check if ticket has already been scanned today (using server time UTC)
      const todayUTC = getServerDateUTC();
      const scanCheckResult = await db.query(
        'SELECT id FROM ticket_scans WHERE ticket_id = $1 AND scan_date = $2',
        [ticket.id, todayUTC]
      );
      
      if (scanCheckResult.rows.length > 0) {
        return res.status(400).json({
          status: 'already_scanned_today',
          message: 'This ticket has already been scanned today',
          ticketType: ticket.ticket_type,
          ticketSubtype: ticket.ticket_subtype,
          name: ticket.name,
        });
      }
      
      // Record the scan with server time UTC
      await db.query(
        'INSERT INTO ticket_scans (ticket_id, scan_date) VALUES ($1, $2)',
        [ticket.id, todayUTC]
      );
      
      return res.json({
        status: 'valid',
        message: 'Access granted to the convention',
        ticketType: ticket.ticket_type,
        ticketSubtype: ticket.ticket_subtype,
        name: ticket.name,
        day: dateCheck.day,
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
