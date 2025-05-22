const { pgTable, varchar, integer, date, boolean, json, text, timestamp } = require('drizzle-orm/pg-core');

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
  adminUserIds: json('admin_user_ids').default([]),
  blockPrivateIPs: boolean('block_private_ips').notNull().default(false),
  blockAction: varchar('block_action', { length: 255 }).default('warn'),
  allowedChannels: json('allowed_channels').default([]),
  customBlockedRanges: json('custom_blocked_ranges').default([]),
});

const disposableUrls = pgTable('disposable_urls', {
  id: text('id').primaryKey(),
  originalUrl: text('original_url').notNull(),
  firstResolvedUrl: text('first_resolved_url').notNull(),
  secondResolvedUrl: text('second_resolved_url'),
  isDisposable: boolean('is_disposable').default(false),
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
});

module.exports = { users, configs, disposableUrls };