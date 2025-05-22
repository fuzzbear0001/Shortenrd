const { EmbedBuilder } = require('discord.js');
const { dbPromise } = require('../drizzle/db');
const { configs } = require('../drizzle/schema');
const { eq } = require('drizzle-orm');
const ipRegex = require('ip-regex');
const client = require('..');
const ipaddr = require('ipaddr.js');

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const db = await dbPromise;
  const guildId = message.guild.id;

  const [config] = await db.select().from(configs).where(eq(configs.guildId, guildId)).execute();
  if (!config || !config.blockPrivateIPs) return;

  const adminUserIds = JSON.parse(config.adminUserIds || '[]');
  const allowedChannels = JSON.parse(config.allowedChannels || '[]');
  const customRanges = JSON.parse(config.customBlockedRanges || '[]');

  if (allowedChannels.length && !allowedChannels.includes(message.channel.id)) return;

  const ipMatches = [...message.content.matchAll(ipRegex())].map(m => m[0]);

  const allBlockedRanges = [
    ['10.0.0.0', '10.255.255.255'],
    ['172.16.0.0', '172.31.255.255'],
    ['192.168.0.0', '192.168.255.255'],
    ['127.0.0.0', '127.255.255.255'],
    ['::1', '::1'],
    ...customRanges.map(cidr => {
      try {
        const range = ipaddr.parseCIDR(cidr);
        return range;
      } catch {
        return null;
      }
    }).filter(Boolean)
  ];

  const isPrivateIP = ip => {
    try {
      const parsed = ipaddr.parse(ip);
      return allBlockedRanges.some(range => {
        if (Array.isArray(range)) return parsed.match(ipaddr.parseCIDR(range.join('/')));
        return parsed.match(range);
      });
    } catch {
      return false;
    }
  };

  const badIP = ipMatches.find(ip => isPrivateIP(ip));
  if (!badIP) return;

  const embed = new EmbedBuilder()
    .setColor('Red')
    .setDescription(`🛑 That link includes a private or blocked IP address: \`${badIP}\``);

  switch (config.blockAction) {
    case 'warn':
      return message.reply({ embeds: [embed] });
    case 'delete':
      return message.delete().catch(() => {});
    case 'delete-log':
      message.delete().catch(() => {});
      if (config.reportChannel) {
        const report = new EmbedBuilder()
          .setTitle('Blocked Private IP Link')
          .setDescription(`A message by <@${message.author.id}> was blocked.`)
          .addFields(
            { name: 'IP', value: badIP },
            { name: 'Content', value: `\`\`\`${message.content.slice(0, 1000)}\`\`\`` },
            { name: 'Channel', value: `<#${message.channel.id}>` }
          )
          .setColor('DarkRed')
          .setTimestamp();
        const logChannel = await client.channels.fetch(config.reportChannel).catch(() => null);
        if (logChannel?.isTextBased()) {
          logChannel.send({ embeds: [report] }).catch(() => {});
        }
      }
      break;
  }
});