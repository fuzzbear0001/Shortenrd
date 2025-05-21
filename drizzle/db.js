const pkg = require('pg');
const { Pool } = pkg;
const schema = require('./schema.js');

// Use top-level async function to handle ESM import
const loadDB = async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  module.exports = { db };
};

loadDB();