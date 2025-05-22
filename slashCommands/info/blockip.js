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

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60000,
      max: 1
    });

    collector.on('collect', async selection => {
      const action = selection.values[0];

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

      await selection.update({
        embeds: [nextEmbed],
        components: [actionRow, configRow]
      });

      const buttonCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });

      buttonCollector.on('collect', async button => {
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

          return button.reply({ embeds: [advEmbed], components: [advRow], ephemeral: true });
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

        await button.reply({
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
      client.on('interactionCreate', async i => {
        if (!i.isStringSelectMenu() || i.user.id !== interaction.user.id) return;

        if (i.customId === 'advanced_option_select') {
          const value = i.values[0];

          if (value === 'cidr') {
            await i.reply({
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

            await i.reply({
              embeds: [new EmbedBuilder().setTitle('📍 Select Channels').setDescription('Choose where IP blocking will apply.').setColor('Blue')],
              components: [channelDropdown],
              ephemeral: true
            });
          }
        }

        if (i.customId === 'channel_select') {
          const channels = i.values;

          await db.update(configs)
            .set({ allowedChannels: JSON.stringify(channels) })
            .where(eq(configs.guildId, guildId))
            .execute();

          await i.reply({
            content: `✅ Restricted to ${channels.length} channel(s).`,
            ephemeral: true
          });
        }
      });
    });
  }
};