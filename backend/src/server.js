require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Debug: Log all email-related environment variables on startup
console.log('🔍 Environment Variables Check:');
console.log('   SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
console.log('   SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
console.log('   SMTP_USER:', process.env.SMTP_USER || 'NOT SET');
console.log('   SMTP_PASS:', process.env.SMTP_PASS ? `${process.env.SMTP_PASS.substring(0, 4)}**** (length: ${process.env.SMTP_PASS.length})` : 'NOT SET');
console.log('   EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET');
console.log('   FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
console.log('');
const authRoutes = require('./routes/auth');
const verifierAuthRoutes = require('./routes/verifier-auth');
const ticketRoutes = require('./routes/tickets');
const verifyRoutes = require('./routes/verify');
const userRoutes = require('./routes/user');
const settingsRoutes = require('./routes/settings');
const statsRoutes = require('./routes/stats');
const shopifyRoutes = require('./routes/shopify');
const migrationRoutes = require('./routes/migration');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Capture raw body for Shopify webhook verification
app.use('/api/shopify', express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', verifierAuthRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/user', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/migration', migrationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
