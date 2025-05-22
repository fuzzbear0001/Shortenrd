const {
  ApplicationCommandType,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
  ChannelType,
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
      return interaction.reply({
        content: 'Only the server owner can run this setup command.',
        ephemeral: true,
      });
    }

    await interaction.guild.members.fetch();
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

    let adminUserIds = JSON.parse(config.adminUserIds || '[]');

    const embed = new EmbedBuilder()
      .setTitle(`Server Setup for ${interaction.guild.name}`)
      .setDescription(
        `Configure admin role, admin users, and report channel.\n\n**Note:** Bot must have a role higher than the admin role.`
      )
      .addFields(
        { name: 'Admin Role', value: config.adminRoleId ? `<@&${config.adminRoleId}>` : 'Not set', inline: true },
        {
          name: 'Admin Users',
          value: adminUserIds.length ? adminUserIds.map(id => `<@${id}>`).join('\n') : 'No admins set',
          inline: true,
        },
        { name: 'Report Channel', value: config.reportChannel ? `<#${config.reportChannel}>` : 'Not set', inline: true }
      )
      .setColor('Blue')
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('select_admin_role')
        .setPlaceholder('Select Admin Role')
        .setMinValues(1)
        .setMaxValues(1)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('select_admin_users')
        .setPlaceholder('Add/Remove Admin Users')
        .setMinValues(0)
        .setMaxValues(25)
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('select_report_channel')
        .setPlaceholder('Select Report Channel')
        .addChannelTypes(ChannelType.GuildText)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
      ephemeral: true,
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.SelectMenu, // General for all selects
      time: 120_000,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
      try {
        await i.deferReply({ ephemeral: true });

        if (i.customId === 'select_admin_role') {
          const selectedRoleId = i.values[0];
          config.adminRoleId = selectedRoleId;

          await db
            .insert(configs)
            .values({ guildId, adminRoleId: selectedRoleId })
            .onConflictDoUpdate({ target: configs.guildId, set: { adminRoleId: selectedRoleId } });

          embed.data.fields[0].value = `<@&${selectedRoleId}>`;

          await i.editReply({ content: `✅ Admin role set to <@&${selectedRoleId}>` });
        } else if (i.customId === 'select_admin_users') {
          adminUserIds = i.values;

          await db
            .insert(configs)
            .values({ guildId, adminUserIds: JSON.stringify(adminUserIds) })
            .onConflictDoUpdate({ target: configs.guildId, set: { adminUserIds: JSON.stringify(adminUserIds) } });

          embed.data.fields[1].value = adminUserIds.length
            ? adminUserIds.map(id => `<@${id}>`).join('\n')
            : 'No admins set';

          await i.editReply({ content: `✅ Admin users updated.` });
        } else if (i.customId === 'select_report_channel') {
          const selectedChannelId = i.values[0];
          config.reportChannel = selectedChannelId;

          await db
            .insert(configs)
            .values({ guildId, reportChannel: selectedChannelId })
            .onConflictDoUpdate({ target: configs.guildId, set: { reportChannel: selectedChannelId } });

          embed.data.fields[2].value = `<#${selectedChannelId}>`;

          await i.editReply({ content: `✅ Report channel set to <#${selectedChannelId}>` });
        }

        await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
      } catch (err) {
        console.error(err);
        if (!i.replied && !i.deferred) {
          await i.reply({ content: '❌ Something went wrong.', ephemeral: true });
        }
      }
    });
  },
};