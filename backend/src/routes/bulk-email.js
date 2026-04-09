const express = require('express');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
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

// Returns { html, attachments } — logo is sent as a CID inline attachment (same as ticket emails)
async function buildEmailHtml({ body, recipientName, includeLogo, includeFooter }) {
  // Convert plain-text line breaks to HTML paragraphs if body doesn't already contain block tags
  const hasBlockTags = /<(p|div|h[1-6]|ul|ol|li|br|blockquote)\b/i.test(body);
  let formattedBody;
  if (hasBlockTags) {
    formattedBody = body;
  } else {
    // Wrap each non-empty line in a <p>; blank lines become spacing
    formattedBody = body
      .split('\n')
      .map(line => line.trim() === '' ? '<p style="margin:0;height:1em;"></p>' : `<p style="margin:0 0 0.8em 0;">${line}</p>`)
      .join('\n');
  }

  // Logo banner — use CID inline attachment, not base64 data URI
  let logoBanner = '';
  const attachments = [];
  if (includeLogo) {
    try {
      const settingsResult = await db.query('SELECT convention_name, logo_url FROM settings LIMIT 1');
      if (settingsResult.rows.length > 0) {
        const { convention_name, logo_url } = settingsResult.rows[0];
        if (logo_url) {
          const logoPath = path.join(__dirname, '../..', logo_url);
          if (fs.existsSync(logoPath)) {
            const logoBase64 = fs.readFileSync(logoPath).toString('base64');
            attachments.push({
              filename: 'logo.png',
              content: logoBase64,
              content_id: 'bulklogo',
            });
            logoBanner = `
              <div style="text-align:center;padding:24px 0 16px;">
                <img src="cid:bulklogo" alt="${convention_name}" style="max-width:200px;max-height:80px;object-fit:contain;" />
              </div>`;
          }
        }
      }
    } catch (_) { /* logo is optional — skip silently */ }
  }

  // Footer
  const footer = includeFooter && recipientName
    ? `<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e5e5e5;color:#999;font-size:12px;">
         <p style="margin:0;">Ticket holder: ${recipientName}</p>
       </div>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;text-align:left;">
      ${logoBanner}
      <div style="padding:8px 0;">
        ${formattedBody}
      </div>
      ${footer}
    </div>
  `;

  return { html, attachments };
}

async function sendEmail({ provider, to, subject, html, attachments = [] }) {
  if (provider === 'gmail') {
    const transporter = getGmailTransporter();
    if (!transporter) throw new Error('Gmail is not configured');
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      to,
      subject,
      html,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        cid: a.content_id,
      })),
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
      attachments,
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
    const { subject, body, testEmail, provider = 'resend', includeLogo = false, includeFooter = true } = req.body;

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

    const { html: bodyHtml, attachments } = await buildEmailHtml({
      body,
      recipientName: req.user.name || req.user.email,
      includeLogo,
      includeFooter,
    });

    await sendEmail({
      provider,
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#f44336;color:white;padding:12px;text-align:center;font-weight:bold;margin-bottom:20px;border-radius:4px;">
            🧪 TEST EMAIL — This is a preview
          </div>
          ${bodyHtml}
          <div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:12px;">
            <p style="margin:0;">Sent by: ${req.user.name || req.user.email}</p>
          </div>
        </div>
      `,
      attachments,
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
    const { subject, body, ticketTypes, recipients: explicitRecipients, provider = 'resend', includeLogo = false, includeFooter = true } = req.body;

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
        const { html, attachments } = await buildEmailHtml({
          body,
          recipientName: recipient.name,
          includeLogo,
          includeFooter,
        });

        await sendEmail({
          provider,
          to: recipient.email,
          subject,
          html,
          attachments,
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
