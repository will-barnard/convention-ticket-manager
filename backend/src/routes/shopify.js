const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendTicketEmail, sendAdminNotification } = require('../services/email');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const crypto = require('crypto');
const checkLockdown = require('../middleware/lockdown');

// Middleware to validate Shopify HMAC signature
const validateShopifyHmac = (req, res, next) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  
  console.log('🔑 Shopify webhook request received - validating HMAC signature');
  console.log('HMAC Header:', hmacHeader);
  
  if (!hmacHeader) {
    console.log('❌ 401 Unauthorized: Missing X-Shopify-Hmac-Sha256 header');
    return res.status(401).json({ error: 'Unauthorized: Missing HMAC signature' });
  }
  
  // Create HMAC hash of the raw body
  if (!req.rawBody) {
    console.log('❌ 401 Unauthorized: Raw body not available');
    return res.status(401).json({ error: 'Unauthorized: Cannot verify signature' });
  }
  
  console.log('Raw body length:', req.rawBody.length);
  
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_KEY)
    .update(req.rawBody, 'utf8')
    .digest('base64');
  
  console.log('Computed HMAC:', hash);
  
  if (hash !== hmacHeader) {
    console.log('❌ 401 Unauthorized: Invalid HMAC signature');
    return res.status(401).json({ error: 'Unauthorized: Invalid HMAC signature' });
  }
  
  console.log('✓ HMAC signature validated successfully');
  next();
};

// POST endpoint for Shopify to create attendee tickets
router.post('/create-ticket', validateShopifyHmac, checkLockdown, async (req, res) => {
  let webhookLogId = null;
  
  const { line_items, customer, id: order_id } = req.body;

  // SKU to ticket type/subtype mapping
  const skuMapping = {
    'vip-pass-adult': { type: 'attendee', subtype: 'vip' },
    '2-day-pass-adult': { type: 'attendee', subtype: 'adult_2day' },
    '1-day-pass-adult-saturday': { type: 'attendee', subtype: 'adult_saturday' },
    '1-day-pass-adult-sunday': { type: 'attendee', subtype: 'adult_sunday' },
    '1-day-pass-child-saturday': { type: 'attendee', subtype: 'child_saturday' },
    '1-day-pass-child-sunday': { type: 'attendee', subtype: 'child_sunday' },
    '2-day-pass-child': { type: 'attendee', subtype: 'child_2day' },
    'indie-cymbalsmith-event-ticket': { type: 'attendee', subtype: 'cymbal_summit' }
  };

  // Validate required fields
  if (!line_items || !Array.isArray(line_items)) {
    console.log('❌ 400 Bad Request: Missing or invalid line_items array');
    
    // Log failed webhook
    if (webhookLogId === null) {
      try {
        const logResult = await db.query(
          `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, error_message, webhook_type, created_at) 
           VALUES ($1, $2, FALSE, $3, $4, NOW()) 
           RETURNING id`,
          [order_id ? String(order_id) : null, JSON.stringify(req.body), 'Missing or invalid line_items array', 'order_create']
        );
        webhookLogId = logResult.rows[0].id;
      } catch (logErr) {
        console.error('Failed to log webhook error:', logErr);
      }
    }
    
    return res.status(400).json({ 
      error: 'Missing required field: line_items must be an array' 
    });
  }

  if (!customer || !customer.email || !customer.first_name) {
    console.log('❌ 400 Bad Request: Missing customer information', { customer });
    
    // Log failed webhook
    if (webhookLogId === null) {
      try {
        const logResult = await db.query(
          `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, error_message, webhook_type, created_at) 
           VALUES ($1, $2, FALSE, $3, $4, NOW()) 
           RETURNING id`,
          [order_id ? String(order_id) : null, JSON.stringify(req.body), 'Missing customer information', 'order_create']
        );
        webhookLogId = logResult.rows[0].id;
      } catch (logErr) {
        console.error('Failed to log webhook error:', logErr);
      }
    }
    
    return res.status(400).json({ 
      error: 'Missing required fields: customer.email and customer.first_name are required' 
    });
  }

  const shopify_order_id = order_id ? String(order_id) : null;
  const customerName = `${customer.first_name} ${customer.last_name || ''}`.trim();
  const customerEmail = customer.email;

  // Log webhook to database FIRST (before any processing)
  try {
    const webhookLogResult = await db.query(
      `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, webhook_type, created_at) 
       VALUES ($1, $2, FALSE, $3, NOW()) 
       RETURNING id`,
      [shopify_order_id, JSON.stringify(req.body), 'order_create']
    );
    webhookLogId = webhookLogResult.rows[0].id;
    console.log(`📝 Webhook logged with ID: ${webhookLogId}`);
  } catch (logError) {
    console.error('❌ Failed to log webhook to database:', logError);
    // Continue processing even if logging fails
  }

  console.log(`📦 Processing order ${shopify_order_id} for ${customerName} (${customerEmail})`);
  console.log(`   Found ${line_items.length} line item(s) in order`);

  try {
    // Check for duplicate order - prevent creating tickets multiple times if webhook is sent again
    if (shopify_order_id) {
      const duplicateCheck = await db.query(
        'SELECT id, uuid, shopify_order_id, email_sent FROM tickets WHERE shopify_order_id = $1',
        [shopify_order_id]
      );
      
      if (duplicateCheck.rows.length > 0) {
        console.log(`Duplicate Shopify order detected: ${shopify_order_id}. Returning existing tickets.`);
        
        // Mark webhook as processed (duplicate)
        if (webhookLogId) {
          try {
            await db.query(
              `UPDATE webhook_logs 
               SET processed = TRUE, 
                   processed_at = NOW(), 
                   tickets_created = $1,
                   error_message = 'Duplicate order - tickets already exist'
               WHERE id = $2`,
              [duplicateCheck.rows.length, webhookLogId]
            );
          } catch (updateError) {
            console.error('Failed to update webhook log:', updateError);
          }
        }
        
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

    // Filter line items that have matching ticket SKUs
    const ticketLineItems = line_items.filter(item => {
      const sku = item.sku?.toLowerCase();
      return sku && skuMapping[sku];
    });

    console.log(`🎫 Found ${ticketLineItems.length} ticket line item(s) to process`);

    if (ticketLineItems.length === 0) {
      console.log('ℹ️  No ticket items found in this order. Skipping ticket creation.');
      
      // Mark webhook as processed (no tickets to create)
      if (webhookLogId) {
        try {
          await db.query(
            `UPDATE webhook_logs 
             SET processed = TRUE, 
                 processed_at = NOW(), 
                 tickets_created = 0,
                 error_message = 'No ticket items found in order'
             WHERE id = $1`,
            [webhookLogId]
          );
        } catch (updateError) {
          console.error('Failed to update webhook log:', updateError);
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'No ticket items found in order',
        tickets: []
      });
    }
    
    // Check if auto_send_emails is enabled
    const settingsResult = await db.query('SELECT auto_send_emails FROM settings LIMIT 1');
    const autoSendEmails = settingsResult.rows[0]?.auto_send_emails ?? true;

    const createdTickets = [];
    const failedTickets = [];

    // Process each ticket line item - Create all tickets first without sending emails
    for (const lineItem of ticketLineItems) {
      const sku = lineItem.sku.toLowerCase();
      const ticketMapping = skuMapping[sku];
      const quantity = lineItem.quantity || 1;

      console.log(`   Processing ${quantity}x ${lineItem.name} (SKU: ${sku} -> ${ticketMapping.type}/${ticketMapping.subtype || 'standard'})`);

      // Create multiple tickets if quantity > 1
      for (let i = 0; i < quantity; i++) {
        try {
          const uuid = uuidv4();
          
          // Insert ticket into database
          const result = await db.query(
            `INSERT INTO tickets (ticket_type, ticket_subtype, name, email, uuid, shopify_order_id, email_sent, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
             RETURNING *`,
            [ticketMapping.type, ticketMapping.subtype, customerName, customerEmail, uuid, shopify_order_id, false]
          );

          const ticket = result.rows[0];

          // Generate QR code
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
          const verifyUrl = `${frontendUrl}/verify/${ticket.uuid}`;
          const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl);

          createdTickets.push({
            ...ticket,
            qrCodeDataUrl,
            verifyUrl
          });

          console.log(`      ✓ Created ticket ${i + 1}/${quantity} for ${lineItem.name}`);
        } catch (ticketError) {
          console.error('Failed to create ticket:', ticketError);
          failedTickets.push({ sku, error: ticketError.message });
        }
      }
    }

    // Send one consolidated email with all tickets if auto_send_emails is enabled
    if (autoSendEmails && createdTickets.length > 0) {
      try {
        // Check daily email limit before sending
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const quotaResult = await db.query(
          'SELECT COUNT(*) as sent_today FROM email_send_log WHERE sent_at >= $1 AND success = true',
          [todayStart]
        );
        
        const sentToday = parseInt(quotaResult.rows[0].sent_today);
        const dailyLimit = 100;
        const remaining = dailyLimit - sentToday;
        
        if (remaining > 0) {
          // We have quota remaining, send the email
          await sendTicketEmail({
            to: customerEmail,
            name: customerName,
            tickets: createdTickets
          });
          
          // Update email_sent status for all tickets
          const ticketIds = createdTickets.map(t => t.id);
          await db.query(
            'UPDATE tickets SET email_sent = true, email_sent_at = NOW() WHERE id = ANY($1)',
            [ticketIds]
          );
          
          // Log the email send
          for (const ticket of createdTickets) {
            await db.query(
              'INSERT INTO email_send_log (recipient_email, ticket_id, send_type, success) VALUES ($1, $2, $3, $4)',
              [customerEmail, ticket.id, 'shopify_order', true]
            );
          }
          
          console.log(`📧 Sent consolidated email with ${createdTickets.length} ticket(s) to ${customerEmail}`);
        } else {
          // Daily limit reached, leave tickets marked as unsent
          console.log(`⚠️  Daily email limit reached (${sentToday}/${dailyLimit}). Tickets created but email NOT sent. Use batch send tomorrow.`);
          
          // Send admin notification about hitting the limit
          try {
            await sendAdminNotification({
              subject: 'Daily Email Limit Reached - Tickets Created Without Email',
              message: `A Shopify order was processed but the email was not sent because the daily limit of ${dailyLimit} emails has been reached.`,
              ticketDetails: `Order ID: ${shopify_order_id}\nCustomer: ${customerName} <${customerEmail}>\nTickets Created: ${createdTickets.length}\nEmails Sent Today: ${sentToday}/${dailyLimit}\n\nThe tickets are saved in the database and marked as unsent. Use the batch send feature tomorrow to send these tickets.`
            });
          } catch (notifyError) {
            console.error('Failed to send admin notification:', notifyError);
          }
        }
      } catch (emailError) {
        console.error('Failed to send ticket email:', emailError);
        
        // Send admin notification about the bounce/failure
        try {
          await sendAdminNotification({
            subject: 'Shopify Order Email Delivery Failure',
            message: 'A ticket email from a Shopify order failed to send. The recipient may have an invalid email address or the email server rejected the message.',
            ticketDetails: `Recipient: ${customerName} <${customerEmail}>\nOrder ID: ${shopify_order_id}\nTicket Count: ${createdTickets.length}\nError: ${emailError.message}`
          });
        } catch (notifyError) {
          console.error('Failed to send admin notification:', notifyError);
        }
      }
    }

    console.log(`✅ Successfully created ${createdTickets.length} ticket(s) from order ${shopify_order_id}`);

    // Mark webhook as processed in database
    if (webhookLogId) {
      try {
        await db.query(
          `UPDATE webhook_logs 
           SET processed = TRUE, 
               processed_at = NOW(), 
               tickets_created = $1
           WHERE id = $2`,
          [createdTickets.length, webhookLogId]
        );
        console.log(`✅ Webhook ${webhookLogId} marked as processed`);
      } catch (updateError) {
        console.error('Failed to update webhook log:', updateError);
      }
    }

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdTickets.length} ticket(s)`,
      tickets: createdTickets,
      failed: failedTickets.length > 0 ? failedTickets : undefined
    });

  } catch (error) {
    console.error('Error processing Shopify order:', error);
    
    // Update webhook log with error
    if (webhookLogId) {
      try {
        await db.query(
          `UPDATE webhook_logs 
           SET error_message = $1 
           WHERE id = $2`,
          [error.message || 'Unknown error processing webhook', webhookLogId]
        );
      } catch (updateError) {
        console.error('Failed to update webhook log with error:', updateError);
      }
    }
    
    res.status(500).json({ error: 'Failed to process order' });
  }
});

// POST endpoint for Shopify order refunds
router.post('/refund', validateShopifyHmac, async (req, res) => {
  let webhookLogId = null;
  
  const { id: order_id, refunds } = req.body;
  
  try {
    // Log webhook
    const logResult = await db.query(
      `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, webhook_type, created_at) 
       VALUES ($1, $2, FALSE, $3, NOW()) 
       RETURNING id`,
      [order_id ? String(order_id) : null, JSON.stringify(req.body), 'refund']
    );
    webhookLogId = logResult.rows[0].id;
    
    // Check if order has tickets in our system
    const ticketsResult = await db.query(
      'SELECT id, uuid, name, email FROM tickets WHERE shopify_order_id = $1',
      [String(order_id)]
    );
    
    if (ticketsResult.rows.length === 0) {
      console.log(`⚠️  No tickets found for order ${order_id}`);
      
      await db.query(
        `UPDATE webhook_logs 
         SET processed = TRUE, 
             processed_at = NOW(), 
             error_message = $1
         WHERE id = $2`,
        ['No tickets found for this order', webhookLogId]
      );
      
      return res.status(200).json({ 
        message: 'No tickets found for this order',
        order_id 
      });
    }
    
    // Update all tickets for this order to refunded status
    await db.query(
      'UPDATE tickets SET status = $1 WHERE shopify_order_id = $2',
      ['refunded', String(order_id)]
    );
    
    console.log(`✅ Marked ${ticketsResult.rows.length} ticket(s) as refunded for order ${order_id}`);
    
    // Send admin notification
    const ticketList = ticketsResult.rows.map(t => 
      `- ${t.name} (${t.email}) - UUID: ${t.uuid}`
    ).join('\n');
    
    await sendAdminNotification({
      subject: `Order Refunded - ${ticketsResult.rows.length} Ticket(s) Invalidated`,
      message: `Order #${order_id} has been refunded.`,
      ticketDetails: `The following tickets have been marked as refunded:\n\n${ticketList}\n\nRefund Details:\n${JSON.stringify(refunds, null, 2)}`
    });
    
    // Mark webhook as processed
    await db.query(
      `UPDATE webhook_logs 
       SET processed = TRUE, 
           processed_at = NOW(), 
           tickets_created = $1
       WHERE id = $2`,
      [ticketsResult.rows.length, webhookLogId]
    );
    
    res.status(200).json({
      success: true,
      message: `Marked ${ticketsResult.rows.length} ticket(s) as refunded`,
      tickets_updated: ticketsResult.rows.length
    });
    
  } catch (error) {
    console.error('Error processing refund webhook:', error);
    
    if (webhookLogId) {
      await db.query(
        `UPDATE webhook_logs 
         SET error_message = $1 
         WHERE id = $2`,
        [error.message || 'Unknown error processing refund webhook', webhookLogId]
      );
    }
    
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// POST endpoint for Shopify disputes/chargebacks
router.post('/chargeback', validateShopifyHmac, async (req, res) => {
  let webhookLogId = null;
  
  const { id: dispute_id, order_id } = req.body;
  
  try {
    // Log webhook
    const logResult = await db.query(
      `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, webhook_type, created_at) 
       VALUES ($1, $2, FALSE, $3, NOW()) 
       RETURNING id`,
      [order_id ? String(order_id) : null, JSON.stringify(req.body), 'chargeback']
    );
    webhookLogId = logResult.rows[0].id;
    
    // Check if order has tickets in our system
    const ticketsResult = await db.query(
      'SELECT id, uuid, name, email FROM tickets WHERE shopify_order_id = $1',
      [String(order_id)]
    );
    
    if (ticketsResult.rows.length === 0) {
      console.log(`⚠️  No tickets found for order ${order_id}`);
      
      await db.query(
        `UPDATE webhook_logs 
         SET processed = TRUE, 
             processed_at = NOW(), 
             error_message = $1
         WHERE id = $2`,
        ['No tickets found for this order', webhookLogId]
      );
      
      return res.status(200).json({ 
        message: 'No tickets found for this order',
        order_id 
      });
    }
    
    // Update all tickets for this order to chargeback status
    await db.query(
      'UPDATE tickets SET status = $1 WHERE shopify_order_id = $2',
      ['chargeback', String(order_id)]
    );
    
    console.log(`⚠️  Marked ${ticketsResult.rows.length} ticket(s) as chargeback for order ${order_id}`);
    
    // Send admin notification
    const ticketList = ticketsResult.rows.map(t => 
      `- ${t.name} (${t.email}) - UUID: ${t.uuid}`
    ).join('\n');
    
    await sendAdminNotification({
      subject: `⚠️ CHARGEBACK ALERT - ${ticketsResult.rows.length} Ticket(s) Invalidated`,
      message: `A chargeback/dispute has been filed for Order #${order_id}.`,
      ticketDetails: `The following tickets have been marked as chargeback:\n\n${ticketList}\n\nDispute ID: ${dispute_id}\n\nPlease review this case immediately.`
    });
    
    // Mark webhook as processed
    await db.query(
      `UPDATE webhook_logs 
       SET processed = TRUE, 
           processed_at = NOW(), 
           tickets_created = $1
       WHERE id = $2`,
      [ticketsResult.rows.length, webhookLogId]
    );
    
    res.status(200).json({
      success: true,
      message: `Marked ${ticketsResult.rows.length} ticket(s) as chargeback`,
      tickets_updated: ticketsResult.rows.length
    });
    
  } catch (error) {
    console.error('Error processing chargeback webhook:', error);
    
    if (webhookLogId) {
      await db.query(
        `UPDATE webhook_logs 
         SET error_message = $1 
         WHERE id = $2`,
        [error.message || 'Unknown error processing chargeback webhook', webhookLogId]
      );
    }
    
    res.status(500).json({ error: 'Failed to process chargeback' });
  }
});

// POST endpoint for Shopify order cancellations
router.post('/cancel', validateShopifyHmac, async (req, res) => {
  let webhookLogId = null;
  
  const { id: refund_id, order_id, refund_line_items } = req.body;
  
  try {
    // Log webhook
    const logResult = await db.query(
      `INSERT INTO webhook_logs (shopify_order_id, webhook_data, processed, webhook_type, created_at) 
       VALUES ($1, $2, FALSE, $3, NOW()) 
       RETURNING id`,
      [order_id ? String(order_id) : null, JSON.stringify(req.body), 'cancel']
    );
    webhookLogId = logResult.rows[0].id;
    
    // Check if order has tickets in our system
    const ticketsResult = await db.query(
      'SELECT id, uuid, name, email FROM tickets WHERE shopify_order_id = $1',
      [String(order_id)]
    );
    
    if (ticketsResult.rows.length === 0) {
      console.log(`⚠️  No tickets found for order ${order_id}`);
      
      await db.query(
        `UPDATE webhook_logs 
         SET processed = TRUE, 
             processed_at = NOW(), 
             error_message = $1
         WHERE id = $2`,
        ['No tickets found for this order', webhookLogId]
      );
      
      return res.status(200).json({ 
        message: 'No tickets found for this order',
        order_id 
      });
    }
    
    // Update all tickets for this order to cancelled status
    await db.query(
      'UPDATE tickets SET status = $1 WHERE shopify_order_id = $2',
      ['cancelled', String(order_id)]
    );
    
    console.log(`✅ Marked ${ticketsResult.rows.length} ticket(s) as cancelled for order ${order_id}`);
    
    // Send admin notification
    const ticketList = ticketsResult.rows.map(t => 
      `- ${t.name} (${t.email}) - UUID: ${t.uuid}`
    ).join('\n');
    
    await sendAdminNotification({
      subject: `Order Cancelled - ${ticketsResult.rows.length} Ticket(s) Invalidated`,
      message: `Order #${order_id} has been cancelled.`,
      ticketDetails: `The following tickets have been marked as cancelled:\n\n${ticketList}\n\nCancellation Details:\nRefund ID: ${refund_id}\nLine Items: ${refund_line_items?.length || 0}`
    });
    
    // Mark webhook as processed
    await db.query(
      `UPDATE webhook_logs 
       SET processed = TRUE, 
           processed_at = NOW(), 
           tickets_created = $1
       WHERE id = $2`,
      [ticketsResult.rows.length, webhookLogId]
    );
    
    res.status(200).json({
      success: true,
      message: `Marked ${ticketsResult.rows.length} ticket(s) as cancelled`,
      tickets_updated: ticketsResult.rows.length
    });
    
  } catch (error) {
    console.error('Error processing cancel webhook:', error);
    
    if (webhookLogId) {
      await db.query(
        `UPDATE webhook_logs 
         SET error_message = $1 
         WHERE id = $2`,
        [error.message || 'Unknown error processing cancel webhook', webhookLogId]
      );
    }
    
    res.status(500).json({ error: 'Failed to process cancellation' });
  }
});

// Health check endpoint (doesn't require API key)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'shopify-integration' });
});

module.exports = router;
