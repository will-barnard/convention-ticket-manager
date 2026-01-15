const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendTicketEmail, sendAdminNotification } = require('../services/email');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Middleware to validate API key for Shopify webhook
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  console.log('🔑 Shopify webhook request received - validating API key');
  
  if (!apiKey || apiKey !== process.env.SHOPIFY_API_KEY) {
    console.log('❌ 401 Unauthorized: Invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  
  console.log('✓ API key validated successfully');
  next();
};

// POST endpoint for Shopify to create attendee tickets
router.post('/create-ticket', validateApiKey, async (req, res) => {
  // DEBUG: Log incoming request details
  console.log('==================== SHOPIFY WEBHOOK REQUEST ====================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('================================================================');
  
  const { name, email, ticket_subtype, quantity = 1, shopify_order_id } = req.body;

  // Validate required fields
  if (!name || !email || !ticket_subtype) {
    console.log('❌ 400 Bad Request: Missing required fields', { name, email, ticket_subtype });
    return res.status(400).json({ 
      error: 'Missing required fields: name, email, and ticket_subtype are required' 
    });
  }

  // Validate ticket subtype
  const validSubtypes = [
    'vip',
    'adult_2day',
    'adult_saturday',
    'adult_sunday',
    'child_2day',
    'child_saturday',
    'child_sunday'
  ];

  if (!validSubtypes.includes(ticket_subtype)) {
    console.log('❌ 400 Bad Request: Invalid ticket_subtype', { provided: ticket_subtype, validSubtypes });
    return res.status(400).json({ 
      error: 'Invalid ticket_subtype',
      validSubtypes 
    });
  }

  // Validate quantity
  if (typeof quantity !== 'number' || quantity < 1 || quantity > 10) {
    console.log('❌ 400 Bad Request: Invalid quantity', { quantity, type: typeof quantity });
    return res.status(400).json({ 
      error: 'Quantity must be a number between 1 and 10' 
    });
  }

  try {
    // Check for duplicate order - prevent creating tickets multiple times if webhook is sent again
    if (shopify_order_id) {
      const duplicateCheck = await db.query(
        'SELECT id, uuid, shopify_order_id, email_sent FROM tickets WHERE shopify_order_id = $1',
        [shopify_order_id]
      );
      
      if (duplicateCheck.rows.length > 0) {
        console.log(`Duplicate Shopify order detected: ${shopify_order_id}. Returning existing tickets.`);
        return res.status(200).json({
          success: true,
          message: 'Order already processed',
          duplicate: true,
          tickets: duplicateCheck.rows.map(ticket => ({
            id: ticket.id,
            uuid: ticket.uuid,
            shopify_order_id: ticket.shopify_order_id,
            email_sent: ticket.email_sent
          }))
        });
      }
    }
    
    // Check if auto_send_emails is enabled
    const settingsResult = await db.query('SELECT auto_send_emails FROM settings LIMIT 1');
    const autoSendEmails = settingsResult.rows[0]?.auto_send_emails ?? true;

    const createdTickets = [];
    const failedTickets = [];

    // Create multiple tickets if quantity > 1
    for (let i = 0; i < quantity; i++) {
      try {
        const uuid = uuidv4();
        
        // Insert ticket into database
        const result = await db.query(
          `INSERT INTO tickets (ticket_type, ticket_subtype, name, email, uuid, shopify_order_id, email_sent, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
           RETURNING *`,
          ['attendee', ticket_subtype, name, email, uuid, shopify_order_id || null, false]
        );

        const ticket = result.rows[0];

        // Generate QR code
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
        const verifyUrl = `${frontendUrl}/verify/${ticket.uuid}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

        // Send email if auto_send_emails is enabled
        if (autoSendEmails) {
          try {
            await sendTicketEmail({
              to: ticket.email,
              name: ticket.name,
              ticketType: ticket.ticket_type,
              ticketSubtype: ticket.ticket_subtype,
              qrCodeDataUrl,
              verifyUrl
            });
            
            // Update email_sent status
            await db.query(
              'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = $1',
              [ticket.id]
            );
            
            ticket.email_sent = true;
          } catch (emailError) {
            console.error('Failed to send ticket email:', emailError);
            
            // Send admin notification about the bounce/failure
            try {
              await sendAdminNotification({
                subject: 'Shopify Order Email Delivery Failure',
                message: 'A ticket email from a Shopify order failed to send. The recipient may have an invalid email address or the email server rejected the message.',
                ticketDetails: {
                  recipientEmail: ticket.email,
                  recipientName: ticket.name,
                  ticketType: `${ticket.ticket_type} (${ticket.ticket_subtype})`,
                  ticketId: ticket.id,
                  error: emailError.message || 'Unknown error'
                }
              });
            } catch (notificationErr) {
              console.error('Failed to send admin notification:', notificationErr);
            }
          }
        }

        createdTickets.push({
          id: ticket.id,
          uuid: ticket.uuid,
          shopify_order_id: ticket.shopify_order_id,
          email_sent: ticket.email_sent
        });
      } catch (ticketError) {
        console.error('Failed to create ticket:', ticketError);
        failedTickets.push({ error: ticketError.message });
      }
    }

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdTickets.length} ticket(s)`,
      tickets: createdTickets,
      failed: failedTickets.length > 0 ? failedTickets : undefined
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Health check endpoint (doesn't require API key)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'shopify-integration' });
});

module.exports = router;
