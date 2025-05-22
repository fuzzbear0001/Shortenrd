const {
  ApplicationCommandType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType
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

    const [config] = await db
      .select()
      .from(configs)
      .where(eq(configs.guildId, guildId))
      .execute();

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

    const actionSelectRow = new ActionRowBuilder().addComponents(
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
      components: [actionSelectRow],
      ephemeral: true
    });

    setTimeout(async () => {
      try {
        const message = await interaction.fetchReply();
        if (!message) return;
        const disabledComponents = message.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach(c => c.setDisabled(true));
          return newRow;
        });
        await interaction.editReply({ components: disabledComponents });
      } catch {}
    }, 30_000);

    const selectCollector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      max: 1,
      filter: i => i.user.id === interaction.user.id && i.customId === 'select_action'
    });

    selectCollector.on('collect', async selection => {
      const action = selection.values[0];

      const disabledSelectRow = new ActionRowBuilder().addComponents(
        StringSelectMenuBuilder.from(selection.component).setDisabled(true)
      );

      await selection.update({ components: [disabledSelectRow] });

      const nextEmbed = new EmbedBuilder()
        .setTitle('⚙️ IP Blocking Mode')
        .setDescription('Would you like to **enable** or **disable** private IP blocking?\n\nYou can also open optional advanced settings below.')
        .setColor('Green');

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('enable_blocking')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('disable_blocking')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger)
      );

      const advSettingsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('advanced_config')
          .setLabel('⚙️ Advanced Settings')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [nextEmbed],
        components: [buttonsRow, advSettingsRow]
      });

      setTimeout(async () => {
        try {
          const msg = await interaction.fetchReply();
          if (!msg) return;
          const disabled = msg.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            newRow.components.forEach(c => c.setDisabled(true));
            return newRow;
          });
          await interaction.editReply({ components: disabled });
        } catch {}
      }, 30_000);

      const buttonCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id && ['enable_blocking', 'disable_blocking', 'advanced_config'].includes(i.customId)
      });

      buttonCollector.on('collect', async button => {
        const disabledButtons = button.message.components.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach(c => c.setDisabled(true));
          return newRow;
        });
        await button.update({ components: disabledButtons });

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

      const advancedCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id && i.customId === 'advanced_option_select'
      });

      advancedCollector.on('collect', async i => {
        const disabledAdvRow = new ActionRowBuilder().addComponents(
          StringSelectMenuBuilder.from(i.component).setDisabled(true)
        );

        await i.update({ components: [disabledAdvRow] });

        const value = i.values[0];

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
            .slice(0, 25);

          const channelDropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('channel_select')
              .setPlaceholder('Select channels to restrict IP blocking to')
              .setMinValues(1)
              .setMaxValues(channelOptions.length)
              .addOptions(channelOptions)
          );

          await i.followUp({
            content: 'Select channels where private IP blocking should be active.',
            components: [channelDropdown],
            ephemeral: true
          });

          const channelCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000,
            max: 1,
            filter: i2 => i2.user.id === interaction.user.id && i2.customId === 'channel_select'
          });

          channelCollector.on('collect', async i2 => {
            const disabledRow = new ActionRowBuilder().addComponents(
              StringSelectMenuBuilder.from(i2.component).setDisabled(true)
            );
            await i2.update({ components: [disabledRow] });

            const selectedChannels = i2.values;

            await db.update(configs)
              .set({ allowedChannels: JSON.stringify(selectedChannels) })
              .where(eq(configs.guildId, guildId))
              .execute();

            await i2.followUp({ content: '✅ Allowed channels updated.', ephemeral: true });
          });
        }
      });
    });
  }
};