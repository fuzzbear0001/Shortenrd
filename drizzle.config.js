module.exports = {
  schema: "./drizzle/schema.js",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  driver: "pg", // ✅ correct driver for PostgreSQL
  dbCredentials: {
    connectionString: process.env.DATABASE_URL, // ✅ use 'connectionString' instead of 'url'
  },
};