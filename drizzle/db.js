const pkg = require('pg');
const { Pool } = pkg;
const schema = require('./schema.js');

const dbPromise = (async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return drizzle(pool, { schema });
})();

module.exports = { dbPromise };