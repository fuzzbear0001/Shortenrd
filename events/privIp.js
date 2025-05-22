// events/messageCreate.js

const { EmbedBuilder } = require('discord.js');
const { eq } = require('drizzle-orm');
const { dbPromise } = require('../drizzle/db');
const { configs } = require('../drizzle/schema');
const isPrivateLink = require('../utils/isPrivateLink');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const db = await dbPromise;
    const guildConfig = await db
      .select()
      .from(configs)
      .where(eq(configs.guildId, message.guild.id))
      .limit(1)
      .then(res => res[0]);

    if (!guildConfig?.blockPrivateLinks) return;

    const urls = [...message.content.matchAll(/https?:\/\/[^\s]+/g)].map(m => m[0]);

    for (const url of urls) {
      if (isPrivateLink(url)) {
        const action = guildConfig.blockPrivateLinksAction || 'warn';

        try {
          if (action === 'delete' || action === 'delete_and_log') {
            await message.delete();
          }

          if (action === 'warn') {
            const warnEmbed = new EmbedBuilder()
              .setColor('Yellow')
              .setDescription(`⚠️ <@${message.author.id}>, posting private IP links is not allowed.`);

            await message.reply({ embeds: [warnEmbed] });
          }

          if (action === 'delete_and_log' && guildConfig.reportChannel) {
            const channel = message.guild.channels.cache.get(guildConfig.reportChannel);
            if (channel) {
              const logEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Blocked Private IP Link')
                .addFields(
                  { name: 'User', value: `<@${message.author.id}>`, inline: true },
                  { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                  { name: 'Link', value: `\`${url}\`` }
                )
                .setTimestamp();

              await channel.send({ embeds: [logEmbed] });
            }
          }
        } catch (err) {
          console.error('Error handling private link:', err);
        }

        break;
      }
    }
  },
};