const { Resend } = require('resend');
const db = require('../config/database');

// Check if email is configured
const isEmailConfigured = process.env.RESEND_API_KEY;

// Create Resend client only if API key is configured
let resend = null;
if (isEmailConfigured) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

// Send ticket email with QR code(s)
async function sendTicketEmail({ to, name, ticketType, ticketSubtype, teacherName, supplies, qrCodeDataUrl, verifyUrl, tickets }) {
  // Skip email if not configured
  if (!isEmailConfigured || !resend) {
    console.log('⚠️  Email not configured - skipping email send');
    console.log(`   Ticket would have been sent to: ${to}`);
    return { success: false, message: 'Email not configured' };
  }

  // Debug: Log email configuration
  console.log('📧 Resend Email Configuration:');
  console.log('   RESEND_API_KEY:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 8)}****` : 'NOT SET');
  console.log('   EMAIL_FROM:', process.env.EMAIL_FROM);
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
    child_sunday: 'Child 1-Day Pass (Sunday Only)',
    cymbal_summit: 'Indie Cymbalsmith Event Ticket (Friday Only)'
  };

  // Fetch convention name and logo from settings
  let conventionName = 'Convention';
  let logoUrl = null;
  try {
    const settingsResult = await db.query('SELECT convention_name, logo_url FROM settings LIMIT 1');
    if (settingsResult.rows.length > 0) {
      conventionName = settingsResult.rows[0].convention_name;
      logoUrl = settingsResult.rows[0].logo_url;
    }
  } catch (error) {
    console.log('Note: Could not fetch convention settings, using defaults');
  }

  // Handle consolidated email with multiple tickets
  if (tickets && Array.isArray(tickets) && tickets.length > 0) {
    let ticketsHtml = '';
    const attachments = [];
    
    tickets.forEach((ticket, index) => {
      let ticketLabel = ticketTypeLabels[ticket.ticket_type] || 'Convention Ticket';
      if (ticket.ticket_type === 'attendee' && ticket.ticket_subtype) {
        ticketLabel = subtypeLabels[ticket.ticket_subtype] || ticketLabel;
      }
      
      // Prepare QR code attachment
      const base64Data = ticket.qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
      attachments.push({
        filename: `qr-code-${index + 1}.png`,
        content: base64Data
      });
      
      ticketsHtml += `
        <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 25px; border: 2px solid #ddd;">
          <h2 style="color: #4CAF50; margin-top: 0; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            Ticket ${index + 1} of ${tickets.length}: ${ticketLabel}
          </h2>
          <div style="text-align: center; margin: 20px 0;">
            <img src="cid:qrcode${index}" style="max-width: 300px; border: 2px solid #ddd; padding: 10px; background: white;" alt="QR Code ${index + 1}"/>
          </div>
          <p style="text-align: center; color: #666; font-size: 14px;">
            Scan this QR code at the entrance for check-in
          </p>
        </div>
      `;
    });

    return resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: to,
      subject: `Your ${conventionName} Tickets (${tickets.length} ${tickets.length === 1 ? 'Ticket' : 'Tickets'})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 700px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #4CAF50;
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              padding: 30px;
              background-color: #f9f9f9;
            }
            .footer {
              text-align: center;
              padding: 20px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${logoUrl ? `<div style="text-align: center; padding: 20px 0; background-color: white;">
              <img src="${process.env.FRONTEND_URL}${logoUrl}" alt="${conventionName}" style="max-width: 100%; max-height: 150px; object-fit: contain;" />
            </div>` : ''}
            <div class="header">
              <h1 style="margin: 0;">Your ${conventionName} Tickets</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Thank you for your order! Below are your <strong>${tickets.length} ticket(s)</strong> for ${conventionName}. Each ticket has a unique QR code.</p>
              <p><strong>Important:</strong> Please present each QR code at the entrance for check-in. You can print this email or show it on your phone.</p>
              
              ${ticketsHtml}

              <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <p style="margin: 0;"><strong>Please Note:</strong></p>
                <ul style="margin: 10px 0;">
                  <li>Each QR code can only be scanned once</li>
                  <li>Keep this email safe - you'll need it at the entrance</li>
                  <li>If you have multiple tickets, present each QR code separately</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>See you at ${conventionName}!</p>
              <p>If you have any questions, please contact us.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: attachments
    });
  }

  // Handle single ticket email (backward compatibility for manual ticket creation)
  let ticketLabel = ticketTypeLabels[ticketType] || 'Convention Ticket';
  if (ticketType === 'attendee' && ticketSubtype) {
    ticketLabel = subtypeLabels[ticketSubtype] || ticketLabel;
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

  return resend.emails.send({
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
          ${logoUrl ? `<div style="text-align: center; padding: 20px 0; background-color: white;">
            <img src="${process.env.FRONTEND_URL}${logoUrl}" alt="${conventionName}" style="max-width: 100%; max-height: 150px; object-fit: contain;" />
          </div>` : ''}
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
        content: base64Data
      }
    ]
  });
}

// Send admin notification email
async function sendAdminNotification({ subject, message, ticketDetails }) {
  // Skip if email not configured or admin email not set
  if (!isEmailConfigured || !resend || !process.env.ADMIN_EMAIL) {
    console.log('⚠️  Admin notification skipped - email or admin email not configured');
    return { success: false, message: 'Email not configured' };
  }

  try {
    await resend.emails.send({
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
    });
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
