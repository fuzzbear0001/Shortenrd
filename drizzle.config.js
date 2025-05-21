module.exports = {
  schema: "./drizzle/schema.js",
  out: "./drizzle/migrations",
  dialect: "postgresql",      // add this!
  driver: "pglite",           // change driver to "pglite" for postgres
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};