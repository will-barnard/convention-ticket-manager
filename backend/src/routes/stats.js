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
    
    // Define the 4 categories based on ticket types
    const categories = [
      { name: 'VIP', key: 'vip', subtypes: ['vip'] },
      { name: 'Cymbal Summit', key: 'cymbal_summit', subtypes: ['cymbal_summit'] },
      { name: 'Saturday', key: 'saturday', subtypes: ['adult_2day', 'child_2day', 'adult_saturday', 'child_saturday'] },
      { name: 'Sunday', key: 'sunday', subtypes: ['adult_2day', 'child_2day', 'adult_sunday', 'child_sunday'] }
    ];

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

    for (const category of categories) {
      // Count tickets sold for this category by type
      let soldCount = 0;
      let studentCount = 0;
      let exhibitorCount = 0;
      let attendeeCount = 0;
      const ticketsForCategory = [];

      for (const ticket of tickets) {
        if (ticket.ticket_type === 'attendee') {
          // Check if this attendee ticket matches this category
          if (category.subtypes.includes(ticket.ticket_subtype)) {
            soldCount++;
            attendeeCount++;
            ticketsForCategory.push(ticket.id);
          }
        } else if (ticket.ticket_type === 'student') {
          // Student tickets count for Saturday and Sunday only (not VIP or Cymbal Summit)
          if (category.key === 'saturday' || category.key === 'sunday') {
            soldCount++;
            studentCount++;
            ticketsForCategory.push(ticket.id);
          }
        } else if (ticket.ticket_type === 'exhibitor') {
          // Exhibitor tickets count for Saturday and Sunday only (not VIP or Cymbal Summit)
          if (category.key === 'saturday' || category.key === 'sunday') {
            soldCount++;
            exhibitorCount++;
            ticketsForCategory.push(ticket.id);
          }
        }
      }

      // Count tickets scanned for this category
      const scannedCount = scans.filter(scan => {
        return ticketsForCategory.includes(scan.ticket_id);
      }).length;

      stats.push({
        day: category.name,
        date: null, // No specific date for categories
        sold: soldCount,
        scanned: scannedCount,
        percentage: soldCount > 0 ? Math.round((scannedCount / soldCount) * 100) : 0,
        studentCount: studentCount,
        exhibitorCount: exhibitorCount,
        attendeeCount: attendeeCount
      });
    }

    // Calculate breakdown by ticket type
    const ticketTypeBreakdown = [];
    
    // Student tickets
    const studentTickets = tickets.filter(t => t.ticket_type === 'student');
    const studentScans = scans.filter(s => studentTickets.some(t => t.id === s.ticket_id));
    ticketTypeBreakdown.push({
      type: 'Student',
      sold: studentTickets.length,
      scanned: studentScans.length,
      remaining: studentTickets.length - studentScans.length
    });
    
    // Exhibitor tickets
    const exhibitorTickets = tickets.filter(t => t.ticket_type === 'exhibitor');
    const exhibitorScans = scans.filter(s => exhibitorTickets.some(t => t.id === s.ticket_id));
    ticketTypeBreakdown.push({
      type: 'Exhibitor',
      sold: exhibitorTickets.length,
      scanned: exhibitorScans.length,
      remaining: exhibitorTickets.length - exhibitorScans.length
    });
    
    // Attendee ticket subtypes
    const attendeeSubtypes = [
      { key: 'vip', label: 'VIP (3-Day)' },
      { key: 'adult_2day', label: 'Adult 2-Day' },
      { key: 'adult_saturday', label: 'Adult Saturday' },
      { key: 'adult_sunday', label: 'Adult Sunday' },
      { key: 'child_2day', label: 'Child 2-Day' },
      { key: 'child_saturday', label: 'Child Saturday' },
      { key: 'child_sunday', label: 'Child Sunday' },
      { key: 'cymbal_summit', label: 'Cymbal Summit' }
    ];
    
    for (const subtype of attendeeSubtypes) {
      const subtypeTickets = tickets.filter(t => t.ticket_type === 'attendee' && t.ticket_subtype === subtype.key);
      const subtypeScans = scans.filter(s => subtypeTickets.some(t => t.id === s.ticket_id));
      ticketTypeBreakdown.push({
        type: subtype.label,
        sold: subtypeTickets.length,
        scanned: subtypeScans.length,
        remaining: subtypeTickets.length - subtypeScans.length
      });
    }

    res.json({
      stats: stats,
      totalDays: categories.length,
      ticketTypeBreakdown: ticketTypeBreakdown
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
