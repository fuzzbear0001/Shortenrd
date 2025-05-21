module.exports = {
  schema: "./drizzle/schema.js",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL, // ✅ use `url` here
  },
};