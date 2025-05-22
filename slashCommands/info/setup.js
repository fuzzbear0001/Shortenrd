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
      return interaction.reply({ content: 'Only the server owner can run this setup command.', flags: 64 });
    }

    await interaction.guild.members.fetch(); // ensure full member cache
    const db = await dbPromise;
    const guildId = interaction.guild.id;

    const existing = await db
      .select()
      .from(configs)
      .where(eq(configs.guildId, guildId))
      .limit(1)
      .execute();

    const config = existing[0] || {
      adminRoleId: null,
      adminUserIds: '[]',
      reportChannel: null,
    };

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

    // Role select
    const roleSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_role')
      .setPlaceholder('Select Admin Role')
      .addOptions(
        interaction.guild.roles.cache
          .filter(r => r.editable && r.id !== interaction.guild.id)
          .map(role => ({
            label: role.name.slice(0, 100),
            value: role.id,
            description: role.id === config.adminRoleId
              ? '✅ This role is currently set as admin.'
              : undefined,
          }))
      );

    // Member select
    const memberOptions = interaction.guild.members.cache
  .filter(m => !m.user.bot)
  .first(25) // 👈 only take the first 25 to stay within Discord's limit
  .map(member => ({
    label: member.user.username.slice(0, 100),
    value: member.id,
    description: adminUserIds.includes(member.id)
      ? 'Already in admin list.'
      : undefined,
  }));

    const memberSelect = new StringSelectMenuBuilder()
      .setCustomId('select_admin_users')
      .setPlaceholder('Add/Remove Admin Users')
      .setMinValues(0)
      .setMaxValues(Math.min(memberOptions.length, 25)) // Fix for API error
      .addOptions(memberOptions);

    // Channel select
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('select_report_channel')
      .setPlaceholder('Select Report Channel')
      .setChannelTypes([0]);

    const row1 = new ActionRowBuilder().addComponents(roleSelect);
    const row2 = new ActionRowBuilder().addComponents(memberSelect);
    const row3 = new ActionRowBuilder().addComponents(channelSelect);

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
      flags: 64,
    });

    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120000,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
      try {
        if (i.customId === 'select_admin_role') {
          const selectedRoleId = i.values[0];
          const botMember = interaction.guild.members.me;
          const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);

          if (selectedRole.position >= botMember.roles.highest.position) {
            return i.reply({ content: '❌ My role must be above the selected admin role.', flags: 64 });
          }

          await db
            .insert(configs)
            .values({
              id: guildId,
              guildId,
              adminRoleId: selectedRoleId,
              adminUserIds: JSON.stringify(adminUserIds),
              reportChannel: config.reportChannel || '0', // dummy fallback if null
            })
            .onConflictDoUpdate({
              target: configs.guildId,
              set: { adminRoleId: selectedRoleId },
            })
            .execute();

          config.adminRoleId = selectedRoleId;
          embed.fields[0].value = `<@&${selectedRoleId}>`;
          await i.update({ embeds: [embed], components: [row1, row2, row3] });

        } else if (i.customId === 'select_admin_users') {
          const selectedUserIds = i.values;

          selectedUserIds.forEach(userId => {
            if (adminUserIds.includes(userId)) {
              adminUserIds.splice(adminUserIds.indexOf(userId), 1);
            } else {
              adminUserIds.push(userId);
            }
          });

          await db
            .insert(configs)
            .values({
              id: guildId,
              guildId,
              adminRoleId: config.adminRoleId,
              adminUserIds: JSON.stringify(adminUserIds),
              reportChannel: config.reportChannel || '0',
            })
            .onConflictDoUpdate({
              target: configs.guildId,
              set: { adminUserIds: JSON.stringify(adminUserIds) },
            })
            .execute();

          config.adminUserIds = JSON.stringify(adminUserIds);
          embed.fields[1].value = adminUserIds.length
            ? adminUserIds.map(id => `<@${id}>`).join('\n')
            : 'No admins set';

          await i.update({ embeds: [embed], components: [row1, row2, row3] });

        } else if (i.customId === 'select_report_channel') {
          const selectedChannelId = i.values[0];

          await db
            .insert(configs)
            .values({
              id: guildId,
              guildId,
              adminRoleId: config.adminRoleId,
              adminUserIds: JSON.stringify(adminUserIds),
              reportChannel: selectedChannelId,
            })
            .onConflictDoUpdate({
              target: configs.guildId,
              set: { reportChannel: selectedChannelId },
            })
            .execute();

          config.reportChannel = selectedChannelId;
          embed.fields[2].value = `<#${selectedChannelId}>`;
          await i.update({ embeds: [embed], components: [row1, row2, row3] });
        }
      } catch (err) {
        console.error(err);
        await i.reply({ content: '❌ Something went wrong during setup.', flags: 64 });
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ content: 'Setup session ended.', components: [] });
      } catch {}
    });
  },
};