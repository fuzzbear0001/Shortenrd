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

  const [config] = await db.select().from(configs).where(eq(configs.guildId, guildId)).execute();
  if (!config || !config.blockPrivateIPs) return;

  const adminUserIds = JSON.parse(config.adminUserIds || '[]');
  const allowedChannels = JSON.parse(config.allowedChannels || '[]');
  const customRanges = JSON.parse(config.customBlockedRanges || '[]');

  // Respect channel filter
  if (allowedChannels.length && !allowedChannels.includes(message.channel.id)) return;

  // Dynamically import ip-regex ESM
  const ipRegex = (await import('ip-regex')).default;
  const ipMatches = [...message.content.matchAll(ipRegex())].map(m => m[0]);

  // Define private IP ranges + custom ranges
  const defaultRanges = [
    ['10.0.0.0', '10.255.255.255'],
    ['172.16.0.0', '172.31.255.255'],
    ['192.168.0.0', '192.168.255.255'],
    ['127.0.0.0', '127.255.255.255'],
    ['::1', '::1'],
  ];

  const parsedCustom = customRanges
    .map(cidr => {
      try {
        return ipaddr.parseCIDR(cidr);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const allBlockedRanges = [
    ...defaultRanges.map(([start]) => ipaddr.parseCIDR(`${start}/${ipaddr.parse(start).kind() === 'ipv4' ? '8' : '128'}`)),
    ...parsedCustom
  ];

  // Check if an IP is private or blocked
  const isPrivateIP = ip => {
    try {
      const parsed = ipaddr.parse(ip);
      return allBlockedRanges.some(range => parsed.match(range));
    } catch {
      return false;
    }
  };

  const badIP = ipMatches.find(ip => isPrivateIP(ip));
  if (!badIP) return;

  // Build warning embed
  const embed = new EmbedBuilder()
    .setColor('Red')
    .setDescription(`🛑 That link includes a private or blocked IP address: \`${badIP}\``);

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