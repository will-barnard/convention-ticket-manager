const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();

// Get all tickets with supplies (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get all tickets
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, name, teacher_name, email, uuid, is_used, created_at FROM tickets ORDER BY created_at DESC'
    );
    
    // Get supplies for all tickets
    const suppliesResult = await db.query(
      'SELECT ticket_id, supply_name, quantity FROM ticket_supplies'
    );
    
    // Map supplies to tickets
    const tickets = ticketsResult.rows.map(ticket => {
      const supplies = suppliesResult.rows
        .filter(s => s.ticket_id === ticket.id)
        .map(s => ({ name: s.supply_name, quantity: s.quantity }));
      
      return {
        ...ticket,
        supplies: supplies.length > 0 ? supplies : null
      };
    });
    
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create and send ticket (protected)
router.post('/',
  authMiddleware,
  body('ticketType').isIn(['student', 'exhibitor', 'day_pass']),
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('teacherName').optional().trim(),
  body('supplies').optional().isArray(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { ticketType, name, teacherName, email, supplies } = req.body;
      const ticketUuid = uuidv4();

      // Validate required fields based on ticket type
      if (ticketType === 'student' && !teacherName) {
        return res.status(400).json({ error: 'Teacher name is required for student tickets' });
      }

      // Generate verification URL
      const verifyUrl = `${process.env.FRONTEND_URL}/verify/${ticketUuid}`;

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

      // Save ticket to database
      const result = await db.query(
        'INSERT INTO tickets (ticket_type, name, teacher_name, email, uuid) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [ticketType, name, teacherName || null, email, ticketUuid]
      );

      const ticket = result.rows[0];

      // Save supplies if this is an exhibitor ticket
      if (ticketType === 'exhibitor' && supplies && supplies.length > 0) {
        for (const supply of supplies) {
          await db.query(
            'INSERT INTO ticket_supplies (ticket_id, supply_name, quantity) VALUES ($1, $2, $3)',
            [ticket.id, supply.name, supply.quantity || 1]
          );
        }
      }

      // Send email with QR code
      try {
        await emailService.sendTicketEmail({
          to: email,
          name: name,
          ticketType: ticketType,
          teacherName: teacherName,
          supplies: supplies,
          qrCodeDataUrl: qrCodeDataUrl,
          verifyUrl: verifyUrl,
        });

        res.status(201).json({
          message: 'Ticket created and sent successfully',
          ticket: {
            id: ticket.id,
            ticket_type: ticket.ticket_type,
            name: ticket.name,
            teacher_name: ticket.teacher_name,
            email: ticket.email,
            uuid: ticket.uuid,
            is_used: ticket.is_used,
            created_at: ticket.created_at,
            supplies: supplies || null,
          },
        });
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Ticket is created but email failed
        res.status(201).json({
          message: 'Ticket created but email delivery failed',
          ticket: {
            id: ticket.id,
            ticket_type: ticket.ticket_type,
            name: ticket.name,
            teacher_name: ticket.teacher_name,
            email: ticket.email,
            uuid: ticket.uuid,
            is_used: ticket.is_used,
            created_at: ticket.created_at,
            supplies: supplies || null,
          },
          warning: 'Email could not be sent',
        });
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Delete ticket (protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM tickets WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
