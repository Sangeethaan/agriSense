const { Pool } = require('pg');

/**
 * Shared PostgreSQL connection pool.
 * All queries should go through this pool so connections are reused.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // keep a healthy pool: min 2 idle, max 10 concurrent
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('🐘 PostgreSQL client connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err.message);
});

/**
 * Convenience wrapper — runs a parameterised query on the pool.
 * Usage: const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
 */
const query = (text, params) => pool.query(text, params);

/**
 * Grab a dedicated client for multi-statement transactions.
 * Remember to call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
