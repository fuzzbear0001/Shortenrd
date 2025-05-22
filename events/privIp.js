const { EmbedBuilder } = require('discord.js');
const { dbPromise } = require('../drizzle/db');
const { configs } = require('../drizzle/schema');
const { eq } = require('drizzle-orm');
const client = require('..');
const ipaddr = require('ipaddr.js');

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const db = await dbPromise;
  const guildId = message.guild.id;

  const [config] = await db
    .select()
    .from(configs)
    .where(eq(configs.guildId, guildId))
    .execute();

  if (!config || !config.blockPrivateIPs) return;

  const allowedChannels = Array.isArray(config.allowedChannels) ? config.allowedChannels : [];
  const customRanges = Array.isArray(config.customBlockedRanges) ? config.customBlockedRanges : [];

  // Only apply to messages in allowed channels
  if (allowedChannels.length && !allowedChannels.includes(message.channel.id)) return;

  // Dynamically import ip-regex ESM
  const ipRegex = (await import('ip-regex')).default;
  const ipMatches = [...message.content.matchAll(ipRegex())].map(m => m[0]);

  const defaultCIDRs = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8',
    '::1/128',
    'fc00::/7',
    'fe80::/10',
  ];

  const allCIDRs = [...defaultCIDRs, ...customRanges];

  const parsedCIDRs = allCIDRs
    .map(cidr => {
      try {
        return ipaddr.parseCIDR(cidr);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const isBlockedIP = ip => {
    try {
      const parsed = ipaddr.parse(ip);
      return parsedCIDRs.some(range => parsed.match(range));
    } catch {
      return false;
    }
  };

  const badIP = ipMatches.find(ip => isBlockedIP(ip));
  if (!badIP) return;

  const embed = new EmbedBuilder()
    .setColor('Red')
    .setDescription(`🛑 That message contains a blocked IP address: \`${badIP}\``);

  switch (config.blockAction) {
    case 'warn':
      return message.reply({ embeds: [embed] }).catch(() => {});
    case 'delete':
      return message.delete().catch(() => {});
    case 'delete-log':
      await message.delete().catch(() => {});
      if (config.reportChannel) {
        const report = new EmbedBuilder()
          .setTitle('🚫 Blocked Private IP Link')
          .setDescription(`A message by <@${message.author.id}> was blocked.`)
          .addFields(
            { name: 'IP', value: badIP },
            { name: 'Content', value: `\`\`\`${message.content.slice(0, 1000)}\`\`\`` },
            { name: 'Channel', value: `<#${message.channel.id}>` }
          )
          .setColor('DarkRed')
          .setTimestamp();

        try {
          const logChannel = await client.channels.fetch(config.reportChannel);
          if (logChannel?.isTextBased()) {
            logChannel.send({ embeds: [report] });
          }
        } catch (err) {
          console.error('Log channel fetch/send failed:', err);
        }
      }
      break;
  }
});