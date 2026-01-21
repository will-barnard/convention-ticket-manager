const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const superAdminMiddleware = require('../middleware/superadmin');
const checkLockdown = require('../middleware/lockdown');
const emailService = require('../services/email');

const router = express.Router();

// Get all tickets with supplies (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get all tickets
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, uuid, is_used, email_sent, status, shopify_order_id, booth_range, quantity, created_at FROM tickets ORDER BY created_at DESC'
    );
    
    // Get supplies for all tickets
    const suppliesResult = await db.query(
      'SELECT ticket_id, supply_name, quantity FROM ticket_supplies'
    );
    
    // Get all scans for all tickets with scanner user info
    const scansResult = await db.query(
      `SELECT ts.ticket_id, ts.scan_date, ts.scanned_by_user_id,
              u.username as scanned_by_username
       FROM ticket_scans ts
       LEFT JOIN users u ON ts.scanned_by_user_id = u.id`
    );
    
    // Map supplies and scans to tickets
    const tickets = ticketsResult.rows.map(ticket => {
      const supplies = suppliesResult.rows
        .filter(s => s.ticket_id === ticket.id)
        .map(s => ({ name: s.supply_name, quantity: s.quantity }));
      
      // Get single scan for this ticket (only scanned once, then wristband)
      const ticketScans = scansResult.rows.filter(s => s.ticket_id === ticket.id);
      const scans = {
        scanned: ticketScans.length > 0,
        scannedOn: ticketScans.length > 0 ? ticketScans[0].scan_date : null,
        scannedBy: ticketScans.length > 0 ? {
          userId: ticketScans[0].scanned_by_user_id,
          username: ticketScans[0].scanned_by_username
        } : null
      };
      
      return {
        ...ticket,
        supplies: supplies.length > 0 ? supplies : null,
        scans: scans
      };
    });
    
    // Calculate total check-ins (total scans across all tickets)
    const totalCheckIns = scansResult.rows.length;
    
    res.json({ tickets, totalCheckIns });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create and send ticket (protected)
router.post('/',
  authMiddleware,
  checkLockdown,
  body('ticketType').isIn(['student', 'exhibitor', 'attendee']),
  body('ticketSubtype').optional().trim(),
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('teacherName').optional().trim(),
  body('supplies').optional().isArray(),
  body('quantity').optional().isInt({ min: 1, max: 50 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { ticketType, ticketSubtype, name, teacherName, email, supplies, quantity } = req.body;
      const ticketQuantity = (ticketType === 'attendee' && quantity) ? quantity : 1;

      // Validate ticket_subtype for attendee tickets
      if (ticketType === 'attendee') {
        const validSubtypes = ['vip', 'adult_2day', 'adult_saturday', 'adult_sunday', 'child_2day', 'child_saturday', 'child_sunday', 'cymbal_summit'];
        if (!ticketSubtype || !validSubtypes.includes(ticketSubtype)) {
          return res.status(400).json({ error: 'Valid ticket_subtype is required for attendee tickets' });
        }
      }

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
        'child_sunday',
        'cymbal_summit'
      ];
      
      if (ticketType === 'attendee' && !validSubtypes.includes(ticketSubtype)) {
        return res.status(400).json({ error: 'Invalid ticket subtype' });
      }

      // Generate a manual order ID if creating multiple tickets
      const manualOrderId = ticketQuantity > 1 ? `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : null;

      // Check if auto-send emails is enabled
      const settingsResult = await db.query('SELECT auto_send_emails FROM settings LIMIT 1');
      const autoSendEmails = settingsResult.rows.length > 0 ? settingsResult.rows[0].auto_send_emails : true;

      const createdTickets = [];
      let emailError = null;

      // Create tickets (one or multiple)
      for (let i = 0; i < ticketQuantity; i++) {
        const ticketUuid = uuidv4();
        const verifyUrl = `${process.env.FRONTEND_URL}/verify/${ticketUuid}`;

        // Save ticket to database
        const result = await db.query(
          'INSERT INTO tickets (ticket_type, ticket_subtype, name, teacher_name, email, uuid, shopify_order_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [ticketType, ticketSubtype || null, name, teacherName || null, email, ticketUuid, manualOrderId]
        );

        const ticket = result.rows[0];

        // Save supplies if this is an exhibitor ticket (only for first ticket if multiple)
        if (i === 0 && ticketType === 'exhibitor' && supplies && supplies.length > 0) {
          for (const supply of supplies) {
            await db.query(
              'INSERT INTO ticket_supplies (ticket_id, supply_name, quantity) VALUES ($1, $2, $3)',
              [ticket.id, supply.name, supply.quantity || 1]
            );
          }
        }

        // Generate QR code
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);
        
        createdTickets.push({
          ...ticket,
          qrCodeDataUrl,
          verifyUrl
        });
      }

      // Send email with QR code(s) if auto-send is enabled
      let emailSent = false;
      
      if (autoSendEmails) {
        try {
          if (ticketQuantity > 1) {
            // Send consolidated email for multiple tickets
            await emailService.sendTicketEmail({
              to: email,
              name: name,
              tickets: createdTickets
            });
          } else {
            // Send single ticket email
            await emailService.sendTicketEmail({
              to: email,
              name: name,
              ticketType: ticketType,
              ticketSubtype: ticketSubtype,
              teacherName: teacherName,
              supplies: supplies,
              qrCodeDataUrl: createdTickets[0].qrCodeDataUrl,
              verifyUrl: createdTickets[0].verifyUrl,
            });
          }
          
          emailSent = true;
          
          // Update all tickets to mark email as sent
          const ticketIds = createdTickets.map(t => t.id);
          await db.query(
            'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = ANY($1)',
            [ticketIds]
          );
        } catch (emailErr) {
          console.error('Error sending email:', emailErr);
          emailError = 'Email could not be sent';
          
          // Send admin notification about the bounce/failure
          try {
            await emailService.sendAdminNotification({
              subject: 'Email Delivery Failure',
              message: 'A ticket email failed to send. The recipient may have an invalid email address or the email server rejected the message.',
              ticketDetails: {
                recipientEmail: email,
                recipientName: name,
                ticketType: `${ticketType}${ticketSubtype ? ` (${ticketSubtype})` : ''}`,
                ticketCount: ticketQuantity,
                error: emailErr.message || 'Unknown error'
              }
            });
            console.log('Admin notified of email failure');
          } catch (notificationErr) {
            console.error('Failed to send admin notification:', notificationErr);
          }
        }
      }

      const responseMessage = autoSendEmails 
        ? (emailSent ? `${ticketQuantity} ticket(s) created and sent successfully` : `${ticketQuantity} ticket(s) created but email delivery failed`)
        : `${ticketQuantity} ticket(s) created successfully (email sending disabled)`;

      res.status(201).json({
        message: responseMessage,
        ticketCount: ticketQuantity,
        tickets: createdTickets.map(t => ({
          id: t.id,
          ticket_type: t.ticket_type,
          ticket_subtype: t.ticket_subtype,
          uuid: t.uuid,
          email_sent: emailSent
        })),
        warning: emailError ? 'Email delivery failed' : null
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Create order with multiple tickets of different types (protected)
router.post('/create-order',
  authMiddleware,
  checkLockdown,
  body('customerName').trim().notEmpty(),
  body('email').isEmail(),
  body('tickets').isArray({ min: 1 }),
  body('tickets.*.ticketType').isIn(['student', 'exhibitor', 'attendee']),
  body('tickets.*.name').trim().notEmpty(),
  body('tickets.*.quantity').isInt({ min: 1, max: 50 }),
  body('tickets.*.teacherName').optional().trim(),
  body('tickets.*.ticketSubtype').optional().trim(),
  body('tickets.*.supplies').optional().isArray(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { customerName, email, tickets: ticketItems } = req.body;

      // Validate each ticket based on its type
      for (const ticketItem of ticketItems) {
        if (ticketItem.ticketType === 'student' && !ticketItem.teacherName) {
          return res.status(400).json({ error: 'Teacher name is required for student tickets' });
        }

        if (ticketItem.ticketType === 'attendee') {
          const validSubtypes = ['vip', 'adult_2day', 'adult_saturday', 'adult_sunday', 'child_2day', 'child_saturday', 'child_sunday', 'cymbal_summit'];
          if (!ticketItem.ticketSubtype || !validSubtypes.includes(ticketItem.ticketSubtype)) {
            return res.status(400).json({ error: 'Valid ticket_subtype is required for attendee tickets' });
          }
        }
      }

      // Generate a single manual order ID for all tickets in this order
      const manualOrderId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if auto-send emails is enabled
      const settingsResult = await db.query('SELECT auto_send_emails FROM settings LIMIT 1');
      const autoSendEmails = settingsResult.rows.length > 0 ? settingsResult.rows[0].auto_send_emails : true;

      const createdTickets = [];
      let emailError = null;

      // Create all tickets
      for (const ticketItem of ticketItems) {
        const { ticketType, ticketSubtype, name, teacherName, quantity, supplies, boothRange } = ticketItem;
        const ticketQuantity = quantity || 1;

        // For exhibitor tickets, create ONE ticket with quantity field
        // For other types, create multiple individual tickets
        const ticketsToCreate = ticketType === 'exhibitor' ? 1 : ticketQuantity;

        for (let i = 0; i < ticketsToCreate; i++) {
          const ticketUuid = uuidv4();
          const verifyUrl = `${process.env.FRONTEND_URL}/verify/${ticketUuid}`;

          // Save ticket to database with booth_range and quantity for exhibitor tickets
          const result = await db.query(
            'INSERT INTO tickets (ticket_type, ticket_subtype, name, teacher_name, email, uuid, shopify_order_id, booth_range, quantity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [
              ticketType, 
              ticketSubtype || null, 
              name, 
              teacherName || null, 
              email, 
              ticketUuid, 
              manualOrderId, 
              (ticketType === 'exhibitor' ? boothRange : null),
              (ticketType === 'exhibitor' ? ticketQuantity : 1)
            ]
          );

          const ticket = result.rows[0];

          // Save supplies if this is an exhibitor ticket
          if (ticketType === 'exhibitor' && supplies && supplies.length > 0) {
            for (const supply of supplies) {
              if (supply.name && supply.name.trim()) {
                await db.query(
                  'INSERT INTO ticket_supplies (ticket_id, supply_name, quantity) VALUES ($1, $2, $3)',
                  [ticket.id, supply.name, supply.quantity || 1]
                );
              }
            }
          }

          // Generate QR code
          const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);
          
          createdTickets.push({
            ...ticket,
            qrCodeDataUrl,
            verifyUrl
          });
        }
      }

      // Send consolidated email with all QR codes if auto-send is enabled
      let emailSent = false;
      
      if (autoSendEmails) {
        try {
          await emailService.sendTicketEmail({
            to: email,
            name: customerName,
            tickets: createdTickets
          });
          
          emailSent = true;
          
          // Update all tickets to mark email as sent
          const ticketIds = createdTickets.map(t => t.id);
          await db.query(
            'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = ANY($1)',
            [ticketIds]
          );
        } catch (emailErr) {
          console.error('Error sending email:', emailErr);
          emailError = 'Email could not be sent';
          
          // Send admin notification about the bounce/failure
          try {
            await emailService.sendAdminNotification({
              subject: 'Email Delivery Failure',
              message: 'A ticket email failed to send. The recipient may have an invalid email address or the email server rejected the message.',
              ticketDetails: {
                recipientEmail: email,
                recipientName: customerName,
                ticketCount: createdTickets.length,
                orderType: 'Mixed ticket types',
                error: emailErr.message || 'Unknown error'
              }
            });
            console.log('Admin notified of email failure');
          } catch (notificationErr) {
            console.error('Failed to send admin notification:', notificationErr);
          }
        }
      }

      const totalTickets = createdTickets.length;
      const responseMessage = autoSendEmails 
        ? (emailSent ? `Order created with ${totalTickets} ticket(s) and sent successfully` : `Order created with ${totalTickets} ticket(s) but email delivery failed`)
        : `Order created with ${totalTickets} ticket(s) (email sending disabled)`;

      res.status(201).json({
        message: responseMessage,
        ticketCount: totalTickets,
        orderId: manualOrderId,
        tickets: createdTickets.map(t => ({
          id: t.id,
          ticket_type: t.ticket_type,
          ticket_subtype: t.ticket_subtype,
          uuid: t.uuid,
          email_sent: emailSent
        })),
        warning: emailError ? 'Email delivery failed' : null
      });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Reset database - Delete all tickets (SuperAdmin only) - MUST come before /:id route
router.delete('/reset-database', superAdminMiddleware, async (req, res) => {
  try {
    console.log('SuperAdmin initiated database reset - deleting all tickets');
    
    // Delete all ticket scans first (foreign key constraint)
    await db.query('DELETE FROM ticket_scans');
    console.log('✓ Deleted all ticket scans');
    
    // Delete all ticket supplies
    await db.query('DELETE FROM ticket_supplies');
    console.log('✓ Deleted all ticket supplies');
    
    // Delete all tickets
    const result = await db.query('DELETE FROM tickets RETURNING id');
    const deletedCount = result.rows.length;
    console.log(`✓ Deleted ${deletedCount} tickets`);
    
    res.json({
      message: 'Database reset successful',
      deleted: {
        tickets: deletedCount,
        scans: 'all',
        supplies: 'all'
      }
    });
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ error: 'Server error during database reset' });
  }
});

// Delete ticket (protected)
router.delete('/:id', authMiddleware, checkLockdown, async (req, res) => {
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

// Update ticket status (protected, admin only)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status value
    const validStatuses = ['valid', 'invalid', 'refunded', 'chargeback'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be one of: valid, invalid, refunded, chargeback' 
      });
    }

    const result = await db.query(
      'UPDATE tickets SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    console.log(`Ticket ${id} status updated to: ${status}`);
    res.json({ 
      message: 'Ticket status updated successfully',
      ticket: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit ticket values (SuperAdmin only)
router.put('/:id', authMiddleware, superAdminMiddleware, checkLockdown, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, teacher_name, ticket_subtype } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Get current ticket to check type
    const ticketResult = await db.query(
      'SELECT ticket_type FROM tickets WHERE id = $1',
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Validate ticket_subtype for attendee tickets
    if (ticket.ticket_type === 'attendee' && ticket_subtype) {
      const validSubtypes = ['vip', 'adult_2day', 'adult_saturday', 'adult_sunday', 'child_2day', 'child_saturday', 'child_sunday', 'cymbal_summit'];
      if (!validSubtypes.includes(ticket_subtype)) {
        return res.status(400).json({ error: 'Invalid ticket_subtype' });
      }
    }

    // Update ticket
    const updateResult = await db.query(
      `UPDATE tickets 
       SET name = $1, email = $2, teacher_name = $3, ticket_subtype = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, email, teacher_name || null, ticket_subtype || null, id]
    );

    console.log(`✏️  Ticket ${id} edited by ${req.user.email}`);

    res.json({
      message: 'Ticket updated successfully',
      ticket: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle scan status (SuperAdmin only)
router.post('/:id/scan-status', authMiddleware, superAdminMiddleware, checkLockdown, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!action || !['mark', 'unmark'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "mark" or "unmark"' });
    }

    // Check if ticket exists
    const ticketResult = await db.query(
      'SELECT id FROM tickets WHERE id = $1',
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (action === 'mark') {
      // Check if already scanned
      const scanCheck = await db.query(
        'SELECT id FROM ticket_scans WHERE ticket_id = $1',
        [id]
      );

      if (scanCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Ticket is already marked as scanned' });
      }

      // Mark as scanned
      await db.query(
        'INSERT INTO ticket_scans (ticket_id, scan_date, scanned_by_user_id) VALUES ($1, NOW(), $2)',
        [id, req.user.id]
      );

      console.log(`✅ Ticket ${id} manually marked as scanned by ${req.user.email}`);

      // Get scan date and scanner info
      const scanResult = await db.query(
        `SELECT ts.scan_date, ts.scanned_by_user_id,
                u.username as scanned_by_username
         FROM ticket_scans ts
         LEFT JOIN users u ON ts.scanned_by_user_id = u.id
         WHERE ts.ticket_id = $1`,
        [id]
      );

      res.json({
        message: 'Ticket marked as scanned',
        scanned: true,
        scannedOn: scanResult.rows[0].scan_date,
        scannedBy: {
          userId: scanResult.rows[0].scanned_by_user_id,
          username: scanResult.rows[0].scanned_by_username
        }
      });
    } else {
      // Unmark as scanned
      const deleteResult = await db.query(
        'DELETE FROM ticket_scans WHERE ticket_id = $1',
        [id]
      );

      if (deleteResult.rowCount === 0) {
        return res.status(400).json({ error: 'Ticket was not scanned' });
      }

      console.log(`❌ Ticket ${id} manually unmarked as scanned by ${req.user.email}`);

      res.json({
        message: 'Ticket unmarked as scanned',
        scanned: false,
        scannedOn: null
      });
    }
  } catch (error) {
    console.error('Error toggling scan status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get remaining daily email quota
router.get('/daily-email-quota', authMiddleware, async (req, res) => {
  try {
    // Count emails sent today (since midnight local time)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const result = await db.query(
      'SELECT COUNT(*) as sent_today FROM email_send_log WHERE sent_at >= $1 AND success = true',
      [todayStart]
    );
    
    const sentToday = parseInt(result.rows[0].sent_today);
    const dailyLimit = 100;
    const remaining = Math.max(0, dailyLimit - sentToday);
    
    res.json({
      sentToday,
      dailyLimit,
      remaining
    });
  } catch (error) {
    console.error('Error getting daily email quota:', error);
    res.status(500).json({ error: 'Failed to get email quota' });
  }
});

// Batch send emails for unsent tickets (protected)
router.post('/batch-send-emails', authMiddleware, async (req, res) => {
  try {
    const { ticketType } = req.body;
    
    // Check daily email limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const quotaResult = await db.query(
      'SELECT COUNT(*) as sent_today FROM email_send_log WHERE sent_at >= $1 AND success = true',
      [todayStart]
    );
    
    const sentToday = parseInt(quotaResult.rows[0].sent_today);
    const dailyLimit = 100;
    const remaining = Math.max(0, dailyLimit - sentToday);
    
    if (remaining === 0) {
      return res.status(429).json({ 
        error: 'Daily email limit of 100 emails reached. Please try again tomorrow.',
        sentToday,
        dailyLimit,
        remaining: 0
      });
    }
    
    // Build query based on ticket type filter
    let query = 'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, uuid FROM tickets WHERE (email_sent = false OR email_sent IS NULL)';
    const params = [];
    
    if (ticketType && ticketType !== 'all') {
      query += ' AND ticket_type = $1';
      params.push(ticketType);
    }
    
    query += ' ORDER BY created_at ASC';
    
    // Limit to remaining daily quota
    query += ` LIMIT ${remaining}`;
    
    // Get all tickets that haven't had emails sent (filtered by type if specified)
    const ticketsResult = await db.query(query, params);

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
        
        // Log the email send
        await db.query(
          'INSERT INTO email_send_log (recipient_email, ticket_id, send_type, success) VALUES ($1, $2, $3, $4)',
          [ticket.email, ticket.id, 'batch_send', true]
        );

        sentCount++;

        // Wait 6 seconds before sending next email (10 per minute)
        if (tickets.indexOf(ticket) < tickets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      } catch (emailError) {
        console.error(`Failed to send email for ticket ${ticket.id}:`, emailError);
        failedCount++;
        
        // Log the failed email attempt
        try {
          await db.query(
            'INSERT INTO email_send_log (recipient_email, ticket_id, send_type, success) VALUES ($1, $2, $3, $4)',
            [ticket.email, ticket.id, 'batch_send', false]
          );
        } catch (logError) {
          console.error('Failed to log email failure:', logError);
        }
        
        // Send admin notification about the bounce/failure
        try {
          await emailService.sendAdminNotification({
            subject: 'Batch Email Delivery Failure',
            message: 'A ticket email failed to send during batch processing. The recipient may have an invalid email address or the email server rejected the message.',
            ticketDetails: {
              recipientEmail: ticket.email,
              recipientName: ticket.name,
              ticketType: `${ticket.ticket_type}${ticket.ticket_subtype ? ` (${ticket.ticket_subtype})` : ''}`,
              ticketId: ticket.id,
              error: emailError.message || 'Unknown error'
            }
          });
        } catch (notificationErr) {
          console.error('Failed to send admin notification:', notificationErr);
        }
      }
    }

    // Get updated remaining count
    const updatedQuotaResult = await db.query(
      'SELECT COUNT(*) as sent_today FROM email_send_log WHERE sent_at >= $1 AND success = true',
      [todayStart]
    );
    const updatedSentToday = parseInt(updatedQuotaResult.rows[0].sent_today);
    const updatedRemaining = Math.max(0, dailyLimit - updatedSentToday);

    res.json({
      message: `Batch send complete. Sent: ${sentCount}, Failed: ${failedCount}`,
      sent: sentCount,
      failed: failedCount,
      total: tickets.length,
      dailyQuota: {
        sentToday: updatedSentToday,
        dailyLimit,
        remaining: updatedRemaining
      }
    });
  } catch (error) {
    console.error('Error in batch send:', error);
    res.status(500).json({ error: 'Server error during batch send' });
  }
});

// Send individual ticket email (protected, superadmin only)
router.post('/:id/send-email', authMiddleware, superAdminMiddleware, async (req, res) => {
  const ticketId = parseInt(req.params.id);

  try {
    // Get ticket details
    const ticketResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, name, teacher_name, email, uuid FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(ticket.uuid);

    // Send email
    await emailService.sendTicketEmail({
      to: ticket.email,
      name: ticket.name,
      tickets: [{
        uuid: ticket.uuid,
        qrCodeDataUrl: qrCodeDataUrl,
        ticket_type: ticket.ticket_type,
        ticket_subtype: ticket.ticket_subtype,
        teacherName: ticket.teacher_name
      }]
    });

    // Mark as sent
    await db.query(
      'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = $1',
      [ticketId]
    );

    res.json({ message: 'Ticket email sent successfully' });
  } catch (error) {
    console.error('Error sending ticket email:', error);
    res.status(500).json({ error: 'Failed to send ticket email' });
  }
});

// Send consolidated email for multiple tickets in an order (protected, admin/superadmin)
router.post('/send-order-email', authMiddleware, async (req, res) => {
  // Allow both admin and superadmin
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { ticketIds, customerName, customerEmail } = req.body;

  if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
    return res.status(400).json({ error: 'ticketIds array is required' });
  }

  if (!customerEmail) {
    return res.status(400).json({ error: 'customerEmail is required' });
  }

  try {
    // Get all tickets
    const ticketsResult = await db.query(
      'SELECT id, ticket_type, ticket_subtype, name, email, uuid FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );

    if (ticketsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No tickets found' });
    }

    const tickets = ticketsResult.rows;

    // Generate QR codes for all tickets
    const ticketsWithQR = await Promise.all(
      tickets.map(async (ticket) => {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
        const verifyUrl = `${frontendUrl}/verify/${ticket.uuid}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);
        
        return {
          ...ticket,
          qrCodeDataUrl,
          verifyUrl
        };
      })
    );

    // Send consolidated email
    await emailService.sendTicketEmail({
      to: customerEmail,
      name: customerName || tickets[0].name,
      tickets: ticketsWithQR
    });

    // Mark all tickets as sent
    await db.query(
      'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = ANY($1)',
      [ticketIds]
    );

    res.json({ 
      message: 'Consolidated email sent successfully',
      ticketsSent: tickets.length 
    });
  } catch (error) {
    console.error('Error sending order email:', error);
    res.status(500).json({ error: 'Failed to send order email' });
  }
});

module.exports = router;

