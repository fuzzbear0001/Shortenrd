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
    // Only guild owner allowed
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: 'Only the server owner can run this setup command.',
        ephemeral: true,
      });
    }

    // Fetch members cache to get roles and members
    await interaction.guild.members.fetch();

    const db = await dbPromise;
    const guildId = interaction.guild.id;

    // Load existing config if any
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

    // Build Select menus
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

    // Send ephemeral reply with setup UI
    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
      ephemeral: true,
    });

    const message = await interaction.fetchReply();

    // Create collector listening for select menus, filtered to original user
    const collector = message.createMessageComponentCollector({
      componentType: [
        ComponentType.RoleSelect,
        ComponentType.UserSelect,
        ComponentType.ChannelSelect,
      ],
      time: 120_000,
      filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
  if (i.user.id !== interaction.user.id) {
    return i.reply({ content: "This is not your setup session.", ephemeral: true });
  }

  try {
    // Defer reply so user sees something after selection
    await i.deferReply({ ephemeral: true });

    if (i.customId === 'select_admin_role') {
      // ... your role selection logic

      await i.editReply({ content: `✅ Admin role set to <@&${selectedRoleId}>` });

      // Also update original setup message with new embed
      await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });

    } else if (i.customId === 'select_admin_users') {
      // ... your admin users toggle logic

      await i.editReply({ content: `✅ Admin users updated.` });

      await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });

    } else if (i.customId === 'select_report_channel') {
      // ... your report channel logic

      await i.editReply({ content: `✅ Report channel set to <#${selectedChannelId}>` });

      await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
    }
  } catch (err) {
    console.error(err);
    if (!i.replied && !i.deferred) {
      await i.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
  }
});
  },
};