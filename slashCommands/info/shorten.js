const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');
const axios = require('axios');
const { dbPromise } = require('../../drizzle/db.js');
const { users } = require('../../drizzle/schema.js');
const { eq } = require('drizzle-orm');

module.exports = {
  name: 'shorten',
  description: 'Shorten a URL using Shortenr',
  type: ApplicationCommandType.ChatInput,
  cooldown: 3000,
  options: [
    {
      name: 'url',
      description: 'The URL to shorten',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  run: async (client, interaction) => {
    const db = await dbPromise;
    const userId = interaction.user.id;
    const url = interaction.options.getString('url');
    const today = new Date().toISOString().split('T')[0];

    // User daily limit check & update
    const existingUser = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);
    if (!existingUser) {
      await db.insert(users).values({
        id: userId,
        linkCount: 1,
        lastUsedDate: new Date(),
        totalLinks: 1,
      });
    } else {
      const lastUsed = new Date(existingUser.lastUsedDate).toISOString().split('T')[0];
      if (lastUsed === today) {
        if (existingUser.linkCount >= 10) {
          return interaction.reply({
            content: '⚠️ You have reached your daily limit of 10 shortened links.',
            ephemeral: true,
          });
        }
        await db.update(users)
          .set({
            linkCount: existingUser.linkCount + 1,
            totalLinks: existingUser.totalLinks + 1,
          })
          .where(eq(users.id, userId));
      } else {
        await db.update(users)
          .set({
            linkCount: 1,
            lastUsedDate: new Date(),
            totalLinks: existingUser.totalLinks + 1,
          })
          .where(eq(users.id, userId));
      }
    }

    try {
      const res = await axios.post(
        'https://shortenr.me/api/discord/shorten',
        { url },
        {
          headers: {
            Authorization: 'Bearer HDISIDJSOCHJEEJXJJSKSKFJSISJD82829499292949292938482929JDJSJSJCJDJDJDJ',
          },
        }
      );

      const shortened = res.data?.shortened || 'Unknown';

      // Main embed with all info
      const embed = new EmbedBuilder()
        .setTitle('🔗 Your Link Has Been Shortened!')
        .setColor('#5865F2')
        .setTimestamp()
        .setFooter({ text: 'Powered by Shortenr' })
        .addFields(
          { name: 'Original URL', value: `[Click to visit](${url})`, inline: false },
          { name: 'Shortened URL', value: `[Click to visit](${shortened})`, inline: false }
        );

      // Buttons: Visit link & Copy Link only
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Visit')
          .setStyle(ButtonStyle.Link)
          .setURL(shortened),
        new ButtonBuilder()
          .setCustomId(`copy_link_${shortened}`)
          .setLabel('Copy Link')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [buttons] });

      // Button collector - only allow original user to interact for 5 minutes
      const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000, // 5 minutes
        filter: i => i.user.id === interaction.user.id
      });

      collector.on('collect', async (btnInt) => {
        if (btnInt.customId.startsWith('copy_link_')) {
          await btnInt.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('📋 Link Copied!')
                .setDescription(`Here is your shortened link:\n${shortened}`)
                .setColor('#43b581')
            ],
            ephemeral: true,
          });
        }
      });

      collector.on('end', async () => {
        // Disable buttons after collector ends
        const disabledButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Visit')
            .setStyle(ButtonStyle.Link)
            .setURL(shortened)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`copy_link_${shortened}`)
            .setLabel('Copy Link')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );

        await interaction.editReply({ components: [disabledButtons] }).catch(() => {});
      });

    } catch (err) {
      console.error('Shorten API error:', err);
      return interaction.reply({
        content: '❌ Failed to shorten the URL. Please try again later.',
        ephemeral: true,
      });
    }
  }
};