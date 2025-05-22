const {
  ApplicationCommandType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

const { dbPromise } = require('../../drizzle/db');
const { configs } = require('../../drizzle/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  name: 'block-ip-mode',
  description: 'Configure private IP blocking.',
  type: ApplicationCommandType.ChatInput,

  run: async (client, interaction) => {
    const db = await dbPromise;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const [config] = await db.select().from(configs).where(eq(configs.guildId, guildId)).execute();
    const adminUserIds = Array.isArray(config?.adminUserIds)
      ? config.adminUserIds
      : JSON.parse(config?.adminUserIds || '[]');

    const isOwner = userId === interaction.guild.ownerId;
    const isAdminRole = config?.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId);
    const isAdminUser = adminUserIds.includes(userId);

    if (!isOwner && !isAdminRole && !isAdminUser) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('🚫 You are not authorized to use this command.')
        ],
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Private IP Blocking')
      .setDescription('Select an action when a private or LAN IP is detected in messages.')
      .setColor('Blurple');

    const actionSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_action')
        .setPlaceholder('Choose action')
        .addOptions([
          { label: 'Warn user', value: 'warn', description: 'Send a warning message' },
          { label: 'Delete message', value: 'delete', description: 'Delete the message silently' },
          { label: 'Delete + Log', value: 'delete-log', description: 'Delete and log the action' }
        ])
    );

    await interaction.reply({
      embeds: [embed],
      components: [actionSelect],
      ephemeral: true
    });

    // Disable the select menu after 30 seconds automatically
    setTimeout(async () => {
      try {
        const disabledRow = new ActionRowBuilder().addComponents(
          actionSelect.components[0].setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] });
      } catch (e) {
        // Fail silently, e.g. if interaction deleted or expired
      }
    }, 30_000);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.message.id === interaction.id,
      time: 60000,
      max: 1
    });

    collector.on('collect', async selection => {
      const action = selection.values[0];

      // Disable the select menu instantly after selection
      const disabledRow = new ActionRowBuilder().addComponents(
        selection.component.setDisabled(true)
      );
      await selection.update({ components: [disabledRow] });

      const nextEmbed = new EmbedBuilder()
        .setTitle('⚙️ IP Blocking Mode')
        .setDescription('Would you like to **enable** or **disable** private IP blocking?\n\nYou can also open optional advanced settings below.')
        .setColor('Green');

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('enable_blocking')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('disable_blocking')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger)
      );

      const configRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('advanced_config')
          .setLabel('⚙️ Advanced Settings')
          .setStyle(ButtonStyle.Secondary)
      );

      await selection.followUp({
        embeds: [nextEmbed],
        components: [actionRow, configRow],
        ephemeral: true
      });

      // Auto-disable buttons after 30 seconds
      const msg = await interaction.fetchReply();

      const disableButtons = async () => {
        try {
          const disabledActionRow1 = new ActionRowBuilder().addComponents(
            actionRow.components.map(btn => btn.setDisabled(true))
          );
          const disabledActionRow2 = new ActionRowBuilder().addComponents(
            configRow.components.map(btn => btn.setDisabled(true))
          );
          await interaction.editReply({
            components: [disabledActionRow1, disabledActionRow2]
          });
        } catch {
          // Ignore errors if already deleted or expired
        }
      };
      setTimeout(disableButtons, 30_000);

      const buttonCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });

      buttonCollector.on('collect', async button => {
        // Disable buttons immediately on interaction
        const disabledActionRow1 = new ActionRowBuilder().addComponents(
          actionRow.components.map(btn => btn.setDisabled(true))
        );
        const disabledActionRow2 = new ActionRowBuilder().addComponents(
          configRow.components.map(btn => btn.setDisabled(true))
        );
        await button.update({
          components: [disabledActionRow1, disabledActionRow2]
        });

        if (button.customId === 'advanced_config') {
          const advEmbed = new EmbedBuilder()
            .setTitle('⚙️ Advanced Settings')
            .setDescription('What would you like to configure?')
            .setColor('Yellow');

          const advRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('advanced_option_select')
              .setPlaceholder('Choose setting to configure')
              .addOptions([
                { label: 'CIDR Ranges', value: 'cidr' },
                { label: 'Restrict Channels', value: 'channels' }
              ])
          );

          return button.followUp({ embeds: [advEmbed], components: [advRow], ephemeral: true });
        }

        const enabled = button.customId === 'enable_blocking';

        await db
          .insert(configs)
          .values({
            id: config?.id || interaction.id,
            guildId,
            blockPrivateIPs: enabled,
            blockAction: action,
            customBlockedRanges: config?.customBlockedRanges || '[]',
            allowedChannels: config?.allowedChannels || '[]',
            reportChannel: config?.reportChannel || null,
            adminRoleId: config?.adminRoleId || null,
            adminUserIds: JSON.stringify(adminUserIds),
            strictMode: config?.strictMode || false
          })
          .onConflictDoUpdate({
            target: configs.guildId,
            set: {
              blockPrivateIPs: enabled,
              blockAction: action
            }
          });

        await button.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor(enabled ? 'Green' : 'Red')
              .setTitle(enabled ? '✅ IP Blocking Enabled' : '🚫 IP Blocking Disabled')
              .setDescription(`• Action: \`${action}\``)
          ],
          ephemeral: true
        });
      });

      // Advanced dropdown collector
      const advancedCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });

      advancedCollector.on('collect', async i => {
        if (!i.isStringSelectMenu() || i.user.id !== interaction.user.id) return;

        if (i.customId === 'advanced_option_select') {
          const value = i.values[0];

          // Disable the select menu after selection
          const disabledAdvRow = new ActionRowBuilder().addComponents(
            i.component.setDisabled(true)
          );
          await i.update({ components: [disabledAdvRow] });

          if (value === 'cidr') {
            await i.followUp({
              content: '📥 Reply with the **CIDR ranges** to block (comma-separated).',
              ephemeral: true
            });

            const msgCollector = i.channel.createMessageCollector({
              filter: m => m.author.id === interaction.user.id,
              time: 60000,
              max: 1
            });

            msgCollector.on('collect', async msg => {
              const ranges = msg.content.split(',').map(r => r.trim());

              await db.update(configs)
                .set({ customBlockedRanges: JSON.stringify(ranges) })
                .where(eq(configs.guildId, guildId))
                .execute();

              await msg.reply({ content: '✅ CIDR ranges updated.', ephemeral: true });
            });
          }

          if (value === 'channels') {
            const channelOptions = interaction.guild.channels.cache
              .filter(c => c.type === ChannelType.GuildText)
              .map(c => ({ label: c.name, value: c.id }))
              .slice(0, 25); // Max 25 options

            const channelDropdown = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('channel_select')
                .setPlaceholder('Select channels to restrict IP blocking to')
                .setMinValues(1)
                .setMaxValues(channelOptions.length)
                .addOptions(channelOptions)
            );

            await i.followUp({
              embeds: [new EmbedBuilder().setTitle('📍 Select Channels').setDescription('Choose where IP blocking will apply.').setColor('Blue')],
              components: [channelDropdown],
              ephemeral: true
            });
          }
        }

        if (i.customId === 'channel_select') {
          // Disable the select menu immediately after selection
          const disabledChannelsRow = new ActionRowBuilder().addComponents(
            i.component.setDisabled(true)
          );
          await i.update({ components: [disabledChannelsRow] });

          const channels = i.values;

          await db.update(configs)
            .set({ allowedChannels: JSON.stringify(channels) })
            .where(eq(configs.guildId, guildId))
            .execute();

          await i.followUp({
            content: `✅ Restricted to ${channels.length} channel(s).`,
            ephemeral: true
          });
        }
      });
    });
  }
};