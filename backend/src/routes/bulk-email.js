const express = require('express');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const superAdminMiddleware = require('../middleware/superadmin');

const router = express.Router();

// Rate limiting - track last send time per user
const lastSendTimes = new Map();
const RATE_LIMIT_MS = 60000; // 1 minute between bulk sends

// Provider helpers
function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function getGmailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function getAvailableProviders() {
  const providers = [];
  if (process.env.RESEND_API_KEY) providers.push('resend');
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) providers.push('gmail');
  return providers;
}

async function sendEmail({ provider, to, subject, html }) {
  if (provider === 'gmail') {
    const transporter = getGmailTransporter();
    if (!transporter) throw new Error('Gmail is not configured');
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to,
      subject,
      html,
    });
  } else {
    // Default: resend
    const resend = getResendClient();
    if (!resend) throw new Error('Resend is not configured');
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
  }
}

// Return which providers are configured
router.get('/providers', authMiddleware, superAdminMiddleware, (req, res) => {
  res.json({ providers: getAvailableProviders() });
});

// Send test email
router.post('/test', authMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { subject, body, testEmail, provider = 'resend' } = req.body;

    if (!subject || !body || !testEmail) {
      return res.status(400).json({ error: 'Subject, body, and test email address are required' });
    }

    const available = getAvailableProviders();
    if (available.length === 0) {
      return res.status(503).json({ error: 'No email provider is configured' });
    }
    if (!available.includes(provider)) {
      return res.status(400).json({ error: `Provider "${provider}" is not configured` });
    }

    await sendEmail({
      provider,
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f44336; color: white; padding: 15px; text-align: center; font-weight: bold; margin-bottom: 20px;">
            🧪 TEST EMAIL - This is a preview
          </div>
          ${body}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee; color: #666; font-size: 12px;">
            <p>This is a test email sent from the Bulk Email tool.</p>
            <p>Sent by: ${req.user.name || req.user.email}</p>
          </div>
        </div>
      `,
    });

    console.log(`📧 Test email sent to ${testEmail} via ${provider} by ${req.user.email}`);

    res.json({
      success: true,
      message: `Test email sent to ${testEmail}`,
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Send bulk email
// Accepts either `ticketTypes` (send to all valid holders) or `recipients` (explicit email list)
router.post('/send', authMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { subject, body, ticketTypes, recipients: explicitRecipients, provider = 'resend' } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and body are required' });
    }

    const available = getAvailableProviders();
    if (available.length === 0) {
      return res.status(503).json({ error: 'No email provider is configured' });
    }
    if (!available.includes(provider)) {
      return res.status(400).json({ error: `Provider "${provider}" is not configured` });
    }

    // Check rate limit
    const userId = req.user.id;
    const lastSendTime = lastSendTimes.get(userId);
    const now = Date.now();

    if (lastSendTime && (now - lastSendTime) < RATE_LIMIT_MS) {
      const remainingSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastSendTime)) / 1000);
      return res.status(429).json({
        error: `Please wait ${remainingSeconds} seconds before sending another bulk email`,
      });
    }

    let recipients;

    if (explicitRecipients && Array.isArray(explicitRecipients) && explicitRecipients.length > 0) {
      // Explicit recipient list sent from the frontend (user-selected individuals)
      const placeholders = explicitRecipients.map((_, i) => `$${i + 1}`).join(', ');
      const result = await db.query(
        `SELECT DISTINCT email, name, ticket_type
         FROM tickets
         WHERE email IN (${placeholders})
           AND email IS NOT NULL
           AND email != ''
           AND (status IS NULL OR status = 'valid')
         ORDER BY email`,
        explicitRecipients,
      );
      recipients = result.rows;
    } else if (ticketTypes && Array.isArray(ticketTypes) && ticketTypes.length > 0) {
      // Fallback: ticket-type based selection
      const placeholders = ticketTypes.map((_, i) => `$${i + 1}`).join(', ');
      const result = await db.query(
        `SELECT DISTINCT email, name, ticket_type
         FROM tickets
         WHERE ticket_type IN (${placeholders})
           AND email IS NOT NULL
           AND email != ''
           AND (status IS NULL OR status = 'valid')
         ORDER BY email`,
        ticketTypes,
      );
      recipients = result.rows;
    } else {
      return res.status(400).json({ error: 'Either recipients or ticketTypes must be provided' });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No valid recipients found' });
    }

    // Check daily email limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const quotaResult = await db.query(
      'SELECT COUNT(*) as sent_today FROM email_send_log WHERE sent_at >= $1 AND success = true',
      [todayStart],
    );

    const sentToday = parseInt(quotaResult.rows[0].sent_today);
    const dailyLimit = 100;
    const remaining = Math.max(0, dailyLimit - sentToday);

    if (remaining === 0) {
      return res.status(429).json({
        error: 'Daily email limit of 100 emails reached. Please try again tomorrow.',
      });
    }

    if (recipients.length > remaining) {
      return res.status(429).json({
        error: `Cannot send ${recipients.length} emails. Only ${remaining} emails remaining in today's quota of 100.`,
      });
    }

    // Update rate limit timestamp
    lastSendTimes.set(userId, now);

    // Send emails with delay (6 seconds between each = 10 per minute)
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const recipient of recipients) {
      try {
        await sendEmail({
          provider,
          to: recipient.email,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              ${body}
              <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee; color: #666; font-size: 12px;">
                <p>Ticket holder: ${recipient.name}</p>
              </div>
            </div>
          `,
        });

        await db.query(
          'INSERT INTO email_send_log (recipient_email, send_type, success) VALUES ($1, $2, $3)',
          [recipient.email, 'bulk_email', true],
        );

        sentCount++;

        // 6-second delay between emails (10 per minute)
        if (sentCount < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
      } catch (error) {
        console.error(`Failed to send to ${recipient.email}:`, error.message);
        failedCount++;
        errors.push({ email: recipient.email, error: error.message });

        try {
          await db.query(
            'INSERT INTO email_send_log (recipient_email, send_type, success) VALUES ($1, $2, $3)',
            [recipient.email, 'bulk_email', false],
          );
        } catch (logError) {
          console.error('Failed to log email failure:', logError);
        }
      }
    }

    console.log(`📧 Bulk email sent via ${provider} by ${req.user.email}: ${sentCount} sent, ${failedCount} failed`);

    res.json({
      success: true,
      message: 'Bulk email sending completed',
      sent: sentCount,
      failed: failedCount,
      total: recipients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error sending bulk email:', error);
    res.status(500).json({ error: 'Failed to send bulk email' });
  }
});

// Get recipient preview — returns both counts and the full individual list
router.post('/preview', authMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { ticketTypes } = req.body;

    if (!ticketTypes || !Array.isArray(ticketTypes) || ticketTypes.length === 0) {
      return res.status(400).json({ error: 'At least one ticket type must be selected' });
    }

    const placeholders = ticketTypes.map((_, i) => `$${i + 1}`).join(', ');

    // Individual recipient rows
    const recipientsResult = await db.query(
      `SELECT DISTINCT ON (email) email, name, ticket_type
       FROM tickets
       WHERE ticket_type IN (${placeholders})
         AND email IS NOT NULL
         AND email != ''
         AND (status IS NULL OR status = 'valid')
       ORDER BY email`,
      ticketTypes,
    );

    // Per-type count breakdown
    const breakdownResult = await db.query(
      `SELECT ticket_type, COUNT(DISTINCT email) as count
       FROM tickets
       WHERE ticket_type IN (${placeholders})
         AND email IS NOT NULL
         AND email != ''
         AND (status IS NULL OR status = 'valid')
       GROUP BY ticket_type`,
      ticketTypes,
    );

    const total = breakdownResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);

    res.json({
      recipients: recipientsResult.rows,
      breakdown: breakdownResult.rows,
      total,
    });
  } catch (error) {
    console.error('Error getting recipient preview:', error);
    res.status(500).json({ error: 'Failed to get recipient preview' });
  }
});

module.exports = router;
