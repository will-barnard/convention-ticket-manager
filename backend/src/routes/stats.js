const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Helper function to get allowed days for an attendee ticket subtype
function getAllowedDaysForSubtype(subtype) {
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

// Get ticket usage statistics by day (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get convention dates from settings
    const settingsResult = await db.query('SELECT friday_date, saturday_date, sunday_date FROM settings LIMIT 1');
    
    if (settingsResult.rows.length === 0) {
      return res.json({
        message: 'Convention dates not configured',
        stats: []
      });
    }

    const settings = settingsResult.rows[0];
    const days = [
      { name: 'Friday', date: settings.friday_date, key: 'friday' },
      { name: 'Saturday', date: settings.saturday_date, key: 'saturday' },
      { name: 'Sunday', date: settings.sunday_date, key: 'sunday' }
    ].filter(day => day.date !== null);

    // Get all tickets
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype FROM tickets'
    );
    const tickets = ticketsResult.rows;

    // Get all ticket scans
    const scansResult = await db.query(
      'SELECT ticket_id, scan_date FROM ticket_scans'
    );
    const scans = scansResult.rows;

    const stats = [];

    for (const day of days) {
      const dateStr = new Date(day.date).toISOString().split('T')[0];
      
      // Count tickets sold for this day by type
      let soldCount = 0;
      let studentCount = 0;
      let exhibitorCount = 0;
      let attendeeCount = 0;
      const ticketsForDay = [];

      for (const ticket of tickets) {
        if (ticket.ticket_type === 'attendee') {
          // Check if this attendee ticket is valid for this day
          const allowedDays = getAllowedDaysForSubtype(ticket.ticket_subtype);
          if (allowedDays.includes(day.key)) {
            soldCount++;
            attendeeCount++;
            ticketsForDay.push(ticket.id);
          }
        } else if (ticket.ticket_type === 'student') {
          // Student tickets are all-access (count for all days)
          soldCount++;
          studentCount++;
          ticketsForDay.push(ticket.id);
        } else if (ticket.ticket_type === 'exhibitor') {
          // Exhibitor tickets are all-access (count for all days)
          soldCount++;
          exhibitorCount++;
          ticketsForDay.push(ticket.id);
        }
      }

      // Count tickets scanned - for multi-day tickets, if scanned once, count for ALL their valid days
      const scannedCount = scans.filter(scan => {
        return ticketsForDay.includes(scan.ticket_id);
      }).length;

      stats.push({
        day: day.name,
        date: day.date,
        sold: soldCount,
        scanned: scannedCount,
        percentage: soldCount > 0 ? Math.round((scannedCount / soldCount) * 100) : 0,
        studentCount: studentCount,
        exhibitorCount: exhibitorCount,
        attendeeCount: attendeeCount
      });
    }

    res.json({
      stats: stats,
      totalDays: days.length
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
