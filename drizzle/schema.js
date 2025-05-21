const { pgTable, varchar, integer, date, boolean } = require('drizzle-orm/pg-core');

const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  linkCount: integer('link_count').notNull(),
  lastUsedDate: date('last_used_date').notNull(),
  totalLinks: integer('total_links').notNull(),
});

const configs = pgTable('configs', {
  id: varchar('id', { length: 255 }).primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).unique().notNull(),
  reportChannel: varchar('report_channel', { length: 255 }).notNull(),
  strictMode: boolean('strict_mode').notNull().default(false),
  adminRoleId: varchar('admin_role_id', { length: 255 }).default(null),
  adminUserIds: json('admin_user_ids').default('[]'),
});

module.exports = {
  users,
  configs,
};