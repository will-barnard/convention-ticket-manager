const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Don't exit the process on idle-client errors — pg drops idle TCP connections
// for normal reasons (postgres restart, network blip, idle_in_transaction_session_timeout)
// and the pool will reconnect on the next checkout. Crashing here, combined with a
// `restart: unless-stopped` policy, produces a boot loop that hammers the DB and VM.
pool.on('error', (err) => {
  console.error('pg pool: idle client error (continuing):', err.message);
});

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction,
  pool,
};
