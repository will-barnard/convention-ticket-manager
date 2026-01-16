const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Get all webhook logs (protected, admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { processed, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT id, shopify_order_id, processed, created_at, processed_at, error_message, tickets_created FROM webhook_logs';
    const params = [];
    
    // Filter by processed status if specified
    if (processed !== undefined) {
      query += ' WHERE processed = $1';
      params.push(processed === 'true');
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM webhook_logs';
    if (processed !== undefined) {
      countQuery += ' WHERE processed = $1';
    }
    const countResult = await db.query(countQuery, processed !== undefined ? [processed === 'true'] : []);
    
    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({ error: 'Failed to fetch webhook logs' });
  }
});

// Get webhook log by ID with full webhook data (protected, admin only)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'SELECT * FROM webhook_logs WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook log not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching webhook log:', error);
    res.status(500).json({ error: 'Failed to fetch webhook log' });
  }
});

// Get webhook logs statistics (protected, admin only)
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_webhooks,
        COUNT(*) FILTER (WHERE processed = TRUE) as processed_webhooks,
        COUNT(*) FILTER (WHERE processed = FALSE) as unprocessed_webhooks,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL) as webhooks_with_errors,
        SUM(tickets_created) as total_tickets_created
      FROM webhook_logs
    `);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching webhook stats:', error);
    res.status(500).json({ error: 'Failed to fetch webhook statistics' });
  }
});

module.exports = router;
