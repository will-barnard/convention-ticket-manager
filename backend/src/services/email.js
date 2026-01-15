const nodemailer = require('nodemailer');
const db = require('../config/database');

// Check if email is configured
const isEmailConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

// Create transporter only if email is configured
let transporter = null;
if (isEmailConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    requireTLS: true, // Enable STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// Send ticket email with QR code
async function sendTicketEmail({ to, name, ticketType, ticketSubtype, teacherName, supplies, qrCodeDataUrl, verifyUrl }) {
  // Skip email if not configured
  if (!isEmailConfigured || !transporter) {
    console.log('⚠️  Email not configured - skipping email send');
    console.log(`   Ticket would have been sent to: ${to}`);
    return { success: false, message: 'Email not configured' };
  }

  // Debug: Log email configuration
  console.log('📧 Email Configuration:');
  console.log('   SMTP_HOST:', process.env.SMTP_HOST);
  console.log('   SMTP_PORT:', process.env.SMTP_PORT);
  console.log('   SMTP_USER:', process.env.SMTP_USER);
  console.log('   SMTP_PASS:', process.env.SMTP_PASS ? `${process.env.SMTP_PASS.substring(0, 4)}****` : 'NOT SET');
  console.log('   EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('   EMAIL_FROM exact value:', JSON.stringify(process.env.EMAIL_FROM));
  console.log('   Sending to:', to);
  
  const ticketTypeLabels = {
    student: 'Student Ticket',
    exhibitor: 'Exhibitor Ticket',
    attendee: 'Attendee Ticket'
  };
  
  const subtypeLabels = {
    vip: 'VIP Pass (Friday, Saturday, Sunday)',
    adult_2day: 'Adult 2-Day Pass (Saturday, Sunday)',
    adult_saturday: 'Adult 1-Day Pass (Saturday Only)',
    adult_sunday: 'Adult 1-Day Pass (Sunday Only)',
    child_2day: 'Child 2-Day Pass (Saturday, Sunday)',
    child_saturday: 'Child 1-Day Pass (Saturday Only)',
    child_sunday: 'Child 1-Day Pass (Sunday Only)'
  };

  let ticketLabel = ticketTypeLabels[ticketType] || 'Convention Ticket';
  if (ticketType === 'attendee' && ticketSubtype) {
    ticketLabel = subtypeLabels[ticketSubtype] || ticketLabel;
  }
  
  // Fetch convention name from settings
  let conventionName = 'Convention';
  try {
    const settingsResult = await db.query('SELECT convention_name FROM settings LIMIT 1');
    if (settingsResult.rows.length > 0) {
      conventionName = settingsResult.rows[0].convention_name;
    }
  } catch (error) {
    console.log('Note: Could not fetch convention name from settings, using default');
  }
  
  // Build supplies list HTML
  let suppliesHtml = '';
  if (ticketType === 'exhibitor' && supplies && supplies.length > 0) {
    suppliesHtml = `
      <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #2e7d32;">Supplies Provided:</h3>
        <ul style="margin: 10px 0;">
          ${supplies.map(s => `<li>${s.name} (Quantity: ${s.quantity})</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Build ticket details HTML
  let detailsHtml = `<p><strong>Name:</strong> ${name}</p>`;
  if (ticketType === 'student' && teacherName) {
    detailsHtml += `<p><strong>Teacher:</strong> ${teacherName}</p>`;
  }
  detailsHtml += `<p><strong>Type:</strong> ${ticketLabel}</p>`;

  // Convert base64 QR code to buffer for attachment
  const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrCodeBuffer = Buffer.from(base64Data, 'base64');

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: `Your ${ticketLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #4CAF50;
            color: white;
            padding: 20px;
            text-align: center;
          }
          .content {
            padding: 20px;
            background-color: #f9f9f9;
          }
          .qr-code {
            text-align: center;
            margin: 30px 0;
          }
          .qr-code img {
            max-width: 300px;
            border: 2px solid #ddd;
            padding: 10px;
            background: white;
          }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${ticketLabel}</h1>
          </div>
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>Your ${conventionName} ticket has been issued.</p>
            ${detailsHtml}
            ${suppliesHtml}
            
            <div class="qr-code">
              <p><strong>Your Ticket QR Code:</strong></p>
              <img src="cid:qrcode" alt="Ticket QR Code" />
              <p>Scan this QR code at the convention entrance</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${verifyUrl}" class="button">View Ticket Online</a>
            </p>
            
            <p><strong>Important:</strong> This ticket can only be used once. Please keep it safe and present it at the convention entrance.</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    attachments: [
      {
        filename: 'qrcode.png',
        content: qrCodeBuffer,
        cid: 'qrcode' // Same as the cid value in the img src
      }
    ]
  };

  return transporter.sendMail(mailOptions);
}

// Send admin notification email
async function sendAdminNotification({ subject, message, ticketDetails }) {
  // Skip if email not configured or admin email not set
  if (!isEmailConfigured || !transporter || !process.env.ADMIN_EMAIL) {
    console.log('⚠️  Admin notification skipped - email or admin email not configured');
    return { success: false, message: 'Email not configured' };
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `[Admin Alert] ${subject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #f44336;
            color: white;
            padding: 20px;
            text-align: center;
          }
          .content {
            padding: 20px;
            background-color: #fff3e0;
            border: 1px solid #ffcc80;
          }
          .details {
            background: white;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
            border: 1px solid #ddd;
          }
          .details p {
            margin: 5px 0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Admin Alert</h1>
          </div>
          <div class="content">
            <h2>${subject}</h2>
            <p>${message}</p>
            
            ${ticketDetails ? `
              <div class="details">
                <h3>Ticket Details:</h3>
                ${ticketDetails.recipientEmail ? `<p><strong>Recipient Email:</strong> ${ticketDetails.recipientEmail}</p>` : ''}
                ${ticketDetails.recipientName ? `<p><strong>Recipient Name:</strong> ${ticketDetails.recipientName}</p>` : ''}
                ${ticketDetails.ticketType ? `<p><strong>Ticket Type:</strong> ${ticketDetails.ticketType}</p>` : ''}
                ${ticketDetails.ticketId ? `<p><strong>Ticket ID:</strong> ${ticketDetails.ticketId}</p>` : ''}
                ${ticketDetails.error ? `<p><strong>Error:</strong> <code>${ticketDetails.error}</code></p>` : ''}
              </div>
            ` : ''}
            
            <p><strong>Action Required:</strong> Please review this issue and take appropriate action.</p>
          </div>
          <div class="footer">
            <p>This is an automated admin notification from your Convention Ticket Manager.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Admin notification sent to ${process.env.ADMIN_EMAIL}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send admin notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendTicketEmail,
  sendAdminNotification,
};
