require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runMigrations } = require('./migrations/run');
const { seedAdminUser } = require('./migrations/seed');
const { seedSuperAdminUser } = require('./migrations/seed-superadmin');
const { seedVerifier } = require('./migrations/seed-verifier');

// Debug: Log all email-related environment variables on startup
console.log('🔍 Environment Variables Check:');
console.log('   RESEND_API_KEY:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 8)}**** (length: ${process.env.RESEND_API_KEY.length})` : 'NOT SET');
console.log('   EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET');
console.log('   ADMIN_EMAIL:', process.env.ADMIN_EMAIL || 'NOT SET');
console.log('   FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
console.log('   CORS_ORIGINS:', process.env.CORS_ORIGINS || '(not set — falling back to FRONTEND_URL)');
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
const webhookRoutes = require('./routes/webhooks');
const bulkEmailRoutes = require('./routes/bulk-email');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

console.log('🔒 CORS allowed origins:', allowedOrigins.length ? allowedOrigins : '(all origins — no restrictions)');

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server/curl (no Origin header) and same-origin requests
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
}));

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '1mb';

// Capture raw body for Shopify webhook verification
app.use('/api/shopify', express.json({
  limit: JSON_BODY_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use(express.json({ limit: JSON_BODY_LIMIT }));
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
app.use('/api/webhooks', webhookRoutes);
app.use('/api/bulk-email', bulkEmailRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Run migrations + seeds before listening. Migrations are advisory-locked so
// blue/green backends serialize automatically; if they fail, the process exits
// (a real misconfiguration we want to surface). Seeds are best-effort: a seed
// failure should not keep the server from coming up.
async function startServer() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('Migrations failed — refusing to start:', err);
    process.exit(1);
  }

  for (const [label, fn] of [
    ['admin', seedAdminUser],
    ['superadmin', seedSuperAdminUser],
    ['verifier', seedVerifier],
  ]) {
    try {
      await fn();
    } catch (err) {
      console.error(`Seed '${label}' failed (continuing):`, err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
