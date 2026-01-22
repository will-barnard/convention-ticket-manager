const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get ticket usage statistics (protected, admin/superadmin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get all tickets with shopify_order_id
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, shopify_order_id FROM tickets'
    );
    const tickets = ticketsResult.rows;

    // Get all ticket scans
    const scansResult = await db.query(
      'SELECT ticket_id FROM ticket_scans'
    );
    const scans = scansResult.rows;
    const scannedTicketIds = new Set(scans.map(s => s.ticket_id));

    // Helper function to count stats for tickets
    const getStats = (ticketList) => {
      const sold = ticketList.length;
      const scanned = ticketList.filter(t => scannedTicketIds.has(t.id)).length;
      const remaining = sold - scanned;
      return { sold, scanned, remaining };
    };

    // Attendee ticket subtypes (8 types at the top)
    const attendeeStats = [
      { key: 'vip', label: 'VIP' },
      { key: 'cymbal_summit', label: 'Cymbal Summit' },
      { key: 'adult_2day', label: 'Adult 2-Day' },
      { key: 'child_2day', label: 'Child 2-Day' },
      { key: 'adult_saturday', label: 'Adult Saturday' },
      { key: 'adult_sunday', label: 'Adult Sunday' },
      { key: 'child_saturday', label: 'Child Saturday' },
      { key: 'child_sunday', label: 'Child Sunday' }
    ].map(subtype => {
      const subtypeTickets = tickets.filter(t => 
        t.ticket_type === 'attendee' && t.ticket_subtype === subtype.key
      );
      return {
        type: subtype.label,
        ...getStats(subtypeTickets)
      };
    });

    // Exhibitor tickets - grouped by order (one order = one exhibitor ticket regardless of quantity)
    const exhibitorTickets = tickets.filter(t => t.ticket_type === 'exhibitor');
    
    // Group by shopify_order_id
    const exhibitorOrders = new Map();
    exhibitorTickets.forEach(ticket => {
      const orderId = ticket.shopify_order_id || `single_${ticket.id}`;
      if (!exhibitorOrders.has(orderId)) {
        exhibitorOrders.set(orderId, []);
      }
      exhibitorOrders.get(orderId).push(ticket);
    });

    // Count orders as sold (not individual tickets)
    // An order is "scanned" if ANY ticket in that order has been scanned
    const exhibitorOrderArray = Array.from(exhibitorOrders.values());
    const exhibitorSold = exhibitorOrderArray.length;
    const exhibitorScanned = exhibitorOrderArray.filter(orderTickets => 
      orderTickets.some(t => scannedTicketIds.has(t.id))
    ).length;
    const exhibitorRemaining = exhibitorSold - exhibitorScanned;

    const exhibitorStats = {
      type: 'Exhibitor',
      sold: exhibitorSold,
      scanned: exhibitorScanned,
      remaining: exhibitorRemaining
    };

    // Student tickets
    const studentTickets = tickets.filter(t => t.ticket_type === 'student');
    const studentStats = {
      type: 'Student',
      ...getStats(studentTickets)
    };

    res.json({
      attendeeStats,
      exhibitorStats,
      studentStats
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
