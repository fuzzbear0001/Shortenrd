// drizzle.config.js
module.exports = {
  schema: "./drizzle/schema.js",
  out: "./drizzle/migrations",
  driver: "postgresql",        // Must be "postgresql" not "pg"
  dbCredentials: {
    url: process.env.DATABASE_URL,  // Make sure env var DATABASE_URL is set properly
  },
};