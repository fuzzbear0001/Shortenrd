const { 
  ApplicationCommandType, 
  ApplicationCommandOptionType, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ChannelSelectMenuBuilder, 
  ComponentType, 
  EmbedBuilder,
  PermissionFlagsBits 
} = require('discord.js');
const { dbPromise } = require('../../drizzle/db.js');
const { configs } = require('../../drizzle/schema.js');

module.exports = {
  name: 'setup',
  description: 'Setup your server admin role, admins, and report channel (guild owner only).',
  type: ApplicationCommandType.ChatInput,
  cooldown: 10000,
  run: async (client, interaction) => {
    // Only guild owner can setup
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'Only the server owner can run this setup command.', ephemeral: true });
    }

const db = await dbPromise;
    // Fetch existing config or default values
    const guildId = interaction.guild.id;
    const existing = await db.select().from(configs).where(configs.guildId.eq(guildId)).limit(1).execute();
    const config = existing[0] || { adminRoleId: null, adminUserIds: '[]', reportChannel: null };

    const adminUserIds = JSON.parse(config.adminUserIds || '[]');

    // Build embed showing current config
    const embed = new EmbedBuilder()
      .setTitle(`Server Setup for ${interaction.guild.name}`)
      .setDescription(`Configure admin role, admin users, and report channel.\n\n**Note:** Bot must have a role higher than the admin role.`)
      .addFields(
        { name: 'Admin Role', value: config.adminRoleId ? `<@&${config.adminRoleId}>` : 'Not set', inline: true },
        { name: 'Admin Users', value: adminUserIds.length ? adminUserIds.map(id => `<@${id}>`).join('\n') : 'No admins set', inline: true },
        { name: 'Report Channel', value: config.reportChannel ? `<#${config.reportChannel}>` : 'Not set', inline: true },
      )
      .setColor('Blue')
      .setTimestamp();

    // Prepare role select menu for admin role (single)
    const roleSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_role')
      .setPlaceholder('Select Admin Role')
      .addOptions(
        interaction.guild.roles.cache
          .filter(r => r.editable && r.id !== interaction.guild.id) // Editable by bot and not @everyone
          .map(role => ({
            label: role.name,
            value: role.id,
            description: role.id === config.adminRoleId ? 'Current admin role' : undefined,
          }))
      );

    // Prepare member select menu for admin users (multi)
    const memberSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_users')
      .setPlaceholder('Add/Remove Admin Users')
      .setMinValues(0)
      .setMaxValues(25)
      .addOptions(
        interaction.guild.members.cache
          .filter(m => !m.user.bot)
          .map(member => ({
            label: member.user.username,
            value: member.id,
            description: adminUserIds.includes(member.id) ? 'Already admin' : undefined,
          }))
      );

    // Prepare channel select menu for report channel (single)
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('select_report_channel')
      .setPlaceholder('Select Report Channel')
      .setChannelTypes([0]); // 0 = GUILD_TEXT only

    // Action rows with selects
    const row1 = new ActionRowBuilder().addComponents(roleSelect);
    const row2 = new ActionRowBuilder().addComponents(memberSelect);
    const row3 = new ActionRowBuilder().addComponents(channelSelect);

    // Reply with embed and selects
    await interaction.reply({ embeds: [embed], components: [row1, row2, row3], ephemeral: true });

    // Create a collector for select menus for 2 minutes
    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120000,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
      if (i.customId === 'select_admin_role') {
        const selectedRoleId = i.values[0];
        const botMember = interaction.guild.members.me;

        // Check bot role position
        const botRolePos = botMember.roles.highest.position;
        const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);

        if (selectedRole.position >= botRolePos) {
          return i.reply({ content: '❌ I need my role to be higher than the admin role to manage permissions properly.', ephemeral: true });
        }

        // Update or insert config
        if (existing.length) {
          await db.update(configs).set({ adminRoleId: selectedRoleId }).where(configs.guildId.eq(guildId)).execute();
        } else {
          await db.insert(configs).values({ 
            id: guildId, 
            guildId, 
            adminRoleId: selectedRoleId, 
            adminUserIds: '[]', 
            reportChannel: null 
          }).execute();
        }

        config.adminRoleId = selectedRoleId;
        embed.fields[0].value = `<@&${selectedRoleId}>`;

        await i.update({ embeds: [embed] });

      } else if (i.customId === 'select_admin_users') {
        const selectedUserIds = i.values;

        // Toggle selected users (add if not exist, remove if already there)
        selectedUserIds.forEach(userId => {
          if (adminUserIds.includes(userId)) {
            // Remove
            const index = adminUserIds.indexOf(userId);
            if (index > -1) adminUserIds.splice(index, 1);
          } else {
            // Add
            adminUserIds.push(userId);
          }
        });

        if (existing.length) {
          await db.update(configs).set({ adminUserIds: JSON.stringify(adminUserIds) }).where(configs.guildId.eq(guildId)).execute();
        } else {
          await db.insert(configs).values({
            id: guildId,
            guildId,
            adminRoleId: null,
            adminUserIds: JSON.stringify(adminUserIds),
            reportChannel: null
          }).execute();
        }

        config.adminUserIds = JSON.stringify(adminUserIds);
        embed.fields[1].value = adminUserIds.length ? adminUserIds.map(id => `<@${id}>`).join('\n') : 'No admins set';

        await i.update({ embeds: [embed] });

      } else if (i.customId === 'select_report_channel') {
        const selectedChannelId = i.values[0];

        if (existing.length) {
          await db.update(configs).set({ reportChannel: selectedChannelId }).where(configs.guildId.eq(guildId)).execute();
        } else {
          await db.insert(configs).values({
            id: guildId,
            guildId,
            adminRoleId: null,
            adminUserIds: '[]',
            reportChannel: selectedChannelId
          }).execute();
        }

        config.reportChannel = selectedChannelId;
        embed.fields[2].value = `<#${selectedChannelId}>`;

        await i.update({ embeds: [embed] });
      }
    });

    collector.on('end', () => {
      interaction.editReply({ content: 'Setup session ended.', components: [] }).catch(() => {});
    });
  },
};