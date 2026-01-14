const express = require('express');
const db = require('../config/database');

const router = express.Router();

// Verify ticket by UUID (public endpoint)
router.get('/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    // Find ticket
    const ticketResult = await db.query(
      'SELECT id, ticket_type, name, teacher_name, email, is_used FROM tickets WHERE uuid = $1',
      [uuid]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        status: 'invalid',
        message: 'Ticket not found',
      });
    }

    const ticket = ticketResult.rows[0];

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
