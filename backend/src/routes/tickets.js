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
      'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, uuid, is_used, created_at FROM tickets ORDER BY created_at DESC'
    );
    
    // Get supplies for all tickets
    const suppliesResult = await db.query(
      'SELECT ticket_id, supply_name, quantity FROM ticket_supplies'
    );
    
    // Get all scans for all tickets
    const scansResult = await db.query(
      'SELECT ticket_id, scan_date FROM ticket_scans'
    );
    
    // Get convention dates from settings
    const settingsResult = await db.query('SELECT friday_date, saturday_date, sunday_date FROM settings LIMIT 1');
    const settings = settingsResult.rows[0] || {};
    
    // Map supplies and scans to tickets
    const tickets = ticketsResult.rows.map(ticket => {
      const supplies = suppliesResult.rows
        .filter(s => s.ticket_id === ticket.id)
        .map(s => ({ name: s.supply_name, quantity: s.quantity }));
      
      // Get scans for this ticket, grouped by day
      const ticketScans = scansResult.rows.filter(s => s.ticket_id === ticket.id);
      const scans = {
        friday: false,
        saturday: false,
        sunday: false
      };
      
      ticketScans.forEach(scan => {
        const scanDateStr = new Date(scan.scan_date).toISOString().split('T')[0];
        if (settings.friday_date && scanDateStr === new Date(settings.friday_date).toISOString().split('T')[0]) {
          scans.friday = true;
        }
        if (settings.saturday_date && scanDateStr === new Date(settings.saturday_date).toISOString().split('T')[0]) {
          scans.saturday = true;
        }
        if (settings.sunday_date && scanDateStr === new Date(settings.sunday_date).toISOString().split('T')[0]) {
          scans.sunday = true;
        }
      });
      
      return {
        ...ticket,
        supplies: supplies.length > 0 ? supplies : null,
        scans: scans
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
  body('ticketType').isIn(['student', 'exhibitor', 'attendee']),
  body('ticketSubtype').optional().trim(),
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

      const { ticketType, ticketSubtype, name, teacherName, email, supplies } = req.body;
      const ticketUuid = uuidv4();

      // Validate required fields based on ticket type
      if (ticketType === 'student' && !teacherName) {
        return res.status(400).json({ error: 'Teacher name is required for student tickets' });
      }
      
      // Validate attendee subtype
      if (ticketType === 'attendee' && !ticketSubtype) {
        return res.status(400).json({ error: 'Ticket subtype is required for attendee tickets' });
      }
      
      const validSubtypes = [
        'vip',
        'adult_2day',
        'adult_saturday',
        'adult_sunday',
        'child_2day',
        'child_saturday',
        'child_sunday'
      ];
      
      if (ticketType === 'attendee' && !validSubtypes.includes(ticketSubtype)) {
        return res.status(400).json({ error: 'Invalid ticket subtype' });
      }

      // Generate verification URL
      const verifyUrl = `${process.env.FRONTEND_URL}/verify/${ticketUuid}`;

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

      // Save ticket to database
      const result = await db.query(
        'INSERT INTO tickets (ticket_type, ticket_subtype, name, teacher_name, email, uuid) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [ticketType, ticketSubtype || null, name, teacherName || null, email, ticketUuid]
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

      // Check if auto-send emails is enabled
      const settingsResult = await db.query('SELECT auto_send_emails FROM settings LIMIT 1');
      const autoSendEmails = settingsResult.rows.length > 0 ? settingsResult.rows[0].auto_send_emails : true;

      // Send email with QR code if auto-send is enabled
      let emailSent = false;
      let emailError = null;
      
      if (autoSendEmails) {
        try {
          await emailService.sendTicketEmail({
            to: email,
            name: name,
            ticketType: ticketType,
            ticketSubtype: ticketSubtype,
            teacherName: teacherName,
            supplies: supplies,
            qrCodeDataUrl: qrCodeDataUrl,
            verifyUrl: verifyUrl,
          });
          
          emailSent = true;
          
          // Update ticket to mark email as sent
          await db.query(
            'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = $1',
            [ticket.id]
          );
        } catch (emailErr) {
          console.error('Error sending email:', emailErr);
          emailError = 'Email could not be sent';
        }
      }

      res.status(201).json({
        message: autoSendEmails 
          ? (emailSent ? 'Ticket created and sent successfully' : 'Ticket created but email delivery failed')
          : 'Ticket created successfully (email sending disabled)',
        ticket: {
          id: ticket.id,
          ticket_type: ticket.ticket_type,
          ticket_subtype: ticket.ticket_subtype,
          name: ticket.name,
          teacher_name: ticket.teacher_name,
          email: ticket.email,
          uuid: ticket.uuid,
          is_used: ticket.is_used,
          created_at: ticket.created_at,
          supplies: supplies || null,
          email_sent: emailSent,
        },
        warning: emailError,
      });
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

// Batch send emails for unsent tickets (protected)
router.post('/batch-send-emails', authMiddleware, async (req, res) => {
  try {
    // Get all tickets that haven't had emails sent
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, uuid FROM tickets WHERE email_sent = false OR email_sent IS NULL ORDER BY created_at ASC'
    );

    if (ticketsResult.rows.length === 0) {
      return res.json({ 
        message: 'No unsent emails found',
        sent: 0,
        failed: 0
      });
    }

    const tickets = ticketsResult.rows;
    let sentCount = 0;
    let failedCount = 0;

    // Send emails with 6-second delay between each (10 per minute)
    for (const ticket of tickets) {
      try {
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

        // Generate verification URL and QR code
        const verifyUrl = `${process.env.FRONTEND_URL}/verify/${ticket.uuid}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

        // Send email
        await emailService.sendTicketEmail({
          to: ticket.email,
          name: ticket.name,
          ticketType: ticket.ticket_type,
          ticketSubtype: ticket.ticket_subtype,
          teacherName: ticket.teacher_name,
          supplies: supplies,
          qrCodeDataUrl: qrCodeDataUrl,
          verifyUrl: verifyUrl,
        });

        // Mark as sent
        await db.query(
          'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = $1',
          [ticket.id]
        );

        sentCount++;

        // Wait 6 seconds before sending next email (10 per minute)
        if (tickets.indexOf(ticket) < tickets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      } catch (emailError) {
        console.error(`Failed to send email for ticket ${ticket.id}:`, emailError);
        failedCount++;
      }
    }

    res.json({
      message: `Batch send complete. Sent: ${sentCount}, Failed: ${failedCount}`,
      sent: sentCount,
      failed: failedCount,
      total: tickets.length
    });
  } catch (error) {
    console.error('Error in batch send:', error);
    res.status(500).json({ error: 'Server error during batch send' });
  }
});

module.exports = router;
