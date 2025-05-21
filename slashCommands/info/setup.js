const { 
  ApplicationCommandType, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ChannelSelectMenuBuilder, 
  ComponentType, 
  EmbedBuilder,
} = require('discord.js');

const { eq } = require('drizzle-orm');
const { configs } = require('../../drizzle/schema.js');
const { dbPromise } = require('../../drizzle/db.js');

module.exports = {
  name: 'setup',
  description: 'Setup your server admin role, admins, and report channel (guild owner only).',
  type: ApplicationCommandType.ChatInput,
  cooldown: 10000,
  run: async (client, interaction) => {
    if (interaction.user.id !== interaction.guild.ownerId) {
      // Use flags: 64 for ephemeral instead of deprecated ephemeral: true
      return interaction.reply({ content: 'Only the server owner can run this setup command.', flags: 64 });
    }

    const db = await dbPromise;
    const guildId = interaction.guild.id;

    const existing = await db
      .select()
      .from(configs)
      .where(eq(configs.guildId, guildId))
      .limit(1)
      .execute();

    const config = existing[0] || { adminRoleId: null, adminUserIds: '[]', reportChannel: null };
    const adminUserIds = JSON.parse(config.adminUserIds || '[]');

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

    // Make sure description strings are 25+ characters or undefined
    const roleSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_role')
      .setPlaceholder('Select Admin Role')
      .addOptions(
        interaction.guild.roles.cache
          .filter(r => r.editable && r.id !== interaction.guild.id)
          .map(role => ({
            label: role.name,
            value: role.id,
            // Only add description if >= 25 chars, else omit to fix error
            description: role.id === config.adminRoleId ? 'This is the currently assigned admin role for this server.' : undefined,
          }))
      );

    const memberSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_users')
      .setPlaceholder('Add or Remove Admin Users')
      .setMinValues(0)
      .setMaxValues(25)
      .addOptions(
        interaction.guild.members.cache
          .filter(m => !m.user.bot)
          .map(member => ({
            label: member.user.username,
            value: member.id,
            description: adminUserIds.includes(member.id)
              ? 'This user currently has admin privileges set on the server.'
              : undefined,
          }))
      );

    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('select_report_channel')
      .setPlaceholder('Select Report Channel')
      .setChannelTypes([0]); // GUILD_TEXT only

    const row1 = new ActionRowBuilder().addComponents(roleSelect);
    const row2 = new ActionRowBuilder().addComponents(memberSelect);
    const row3 = new ActionRowBuilder().addComponents(channelSelect);

    await interaction.reply({ embeds: [embed], components: [row1, row2, row3], flags: 64 });

    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120000,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
      if (i.customId === 'select_admin_role') {
        const selectedRoleId = i.values[0];
        const botMember = interaction.guild.members.me;
        const botRolePos = botMember.roles.highest.position;
        const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);

        if (selectedRole.position >= botRolePos) {
          return i.reply({ content: '❌ I need my role to be higher than the admin role to manage permissions properly.', flags: 64 });
        }

        if (existing.length) {
          await db.update(configs).set({ adminRoleId: selectedRoleId }).where(eq(configs.guildId, guildId)).execute();
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

        selectedUserIds.forEach(userId => {
          if (adminUserIds.includes(userId)) {
            const index = adminUserIds.indexOf(userId);
            if (index > -1) adminUserIds.splice(index, 1);
          } else {
            adminUserIds.push(userId);
          }
        });

        if (existing.length) {
          await db.update(configs).set({ adminUserIds: JSON.stringify(adminUserIds) }).where(eq(configs.guildId, guildId)).execute();
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
          await db.update(configs).set({ reportChannel: selectedChannelId }).where(eq(configs.guildId, guildId)).execute();
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