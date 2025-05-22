const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { dbPromise } = require('../../drizzle/db');
const { configs } = require('../../drizzle/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('block-ip-mode')
    .setDescription('Configure private IP blocking'),
  
  async execute(interaction) {
    const db = await dbPromise;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const [config] = await db.select().from(configs).where(eq(configs.guildId, guildId)).execute();
    const adminUserIds = JSON.parse(config?.adminUserIds || '[]');
    const isOwner = userId === interaction.guild.ownerId;
    const isAdminRole = config?.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId);
    const isAdminUser = adminUserIds.includes(userId);

    if (!isOwner && !isAdminRole && !isAdminUser) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('🚫 You are not authorized to use this command.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Private IP Blocking Setup')
      .setDescription('Select your desired action when a private or LAN IP is detected in messages.')
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

    await interaction.reply({ embeds: [embed], components: [actionSelect], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60000,
      max: 1
    });

    collector.on('collect', async selection => {
      const action = selection.values[0];

      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚙️ Additional Settings')
        .setDescription('React with a ✅ to enable or ❌ to disable IP blocking.\n\nThen, respond with:\n• Custom CIDR ranges (comma-separated)\n• Channel IDs (comma-separated) to restrict checks')
        .setColor('Green');

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('enable_blocking')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('disable_blocking')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger)
      );

      await selection.update({ embeds: [confirmEmbed], components: [buttons] });

      const buttonCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60000,
        max: 1
      });

      buttonCollector.on('collect', async button => {
        const enabled = button.customId === 'enable_blocking';

        await button.reply({ content: '✍️ Please now reply with the **CIDR ranges** to block (comma-separated).', ephemeral: true });

        const cidrCollector = button.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          max: 1,
          time: 60000
        });

        cidrCollector.on('collect', async cidrMsg => {
          const ranges = cidrMsg.content.split(',').map(r => r.trim());

          await cidrMsg.reply({ content: '📢 Now send the **channel IDs** to restrict IP checking to (comma-separated), or type `all`.', ephemeral: true });

          const channelCollector = button.channel.createMessageCollector({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 60000
          });

          channelCollector.on('collect', async chMsg => {
            const channelIDs = chMsg.content.toLowerCase() === 'all'
              ? []
              : chMsg.content.split(',').map(c => c.trim());

            await db
              .insert(configs)
              .values({
                id: config?.id || interaction.id,
                guildId,
                blockPrivateIPs: enabled,
                blockAction: action,
                customBlockedRanges: JSON.stringify(ranges),
                allowedChannels: JSON.stringify(channelIDs),
                reportChannel: config?.reportChannel || null,
                adminRoleId: config?.adminRoleId || null,
                adminUserIds: JSON.stringify(adminUserIds),
                strictMode: config?.strictMode || false
              })
              .onConflictDoUpdate({
                target: configs.guildId,
                set: {
                  blockPrivateIPs: enabled,
                  blockAction: action,
                  customBlockedRanges: JSON.stringify(ranges),
                  allowedChannels: JSON.stringify(channelIDs)
                }
              });

            const doneEmbed = new EmbedBuilder()
              .setColor('Green')
              .setTitle('✅ Configuration Saved')
              .setDescription(`• IP Blocking: **${enabled ? 'Enabled' : 'Disabled'}**\n• Action: \`${action}\`\n• Ranges: \`${ranges.join(', ') || 'None'}\`\n• Channels: \`${channelIDs.length ? channelIDs.join(', ') : 'All'}\``);

            await chMsg.reply({ embeds: [doneEmbed], ephemeral: true });
          });
        });
      });
    });
  }
};