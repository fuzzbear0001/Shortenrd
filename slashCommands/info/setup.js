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
const { randomUUID } = require('crypto');

module.exports = {
  name: 'setup',
  description: 'Setup your server admin role, admins, and report channel (guild owner only).',
  type: ApplicationCommandType.ChatInput,
  cooldown: 10000,

  run: async (client, interaction) => {
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: 'Only the server owner can run this setup command.',
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

    // Safely parse adminUserIds JSON with fallback
    let adminUserIds = [];
    try {
      adminUserIds = JSON.parse(config.adminUserIds || '[]');
      if (!Array.isArray(adminUserIds)) adminUserIds = [];
    } catch {
      adminUserIds = [];
    }

    const generateEmbed = () =>
      new EmbedBuilder()
        .setTitle(`Server Setup for ${interaction.guild.name}`)
        .setDescription(
          `Configure admin role, admin users, and report channel.\n\n**Note:** Bot must have a role higher than the admin role.`
        )
        .addFields(
          {
            name: 'Admin Role',
            value: config.adminRoleId ? `<@&${config.adminRoleId}>` : 'Not set',
            inline: true,
          },
          {
            name: 'Admin Users',
            value: adminUserIds.length
              ? adminUserIds.map((id) => `<@${id}>`).join('\n')
              : 'No admins set',
            inline: true,
          },
          {
            name: 'Report Channel',
            value: config.reportChannel ? `<#${config.reportChannel}>` : 'Not set',
            inline: true,
          }
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

    const response = await interaction.reply({
      embeds: [generateEmbed()],
      components: [row1, row2, row3],
    });

    // Helper to upsert config with generated id (if none exists)
    const upsertConfig = async (partialFields) => {
      const id = existing[0]?.id || randomUUID();

      await db
        .insert(configs)
        .values({
          id, // must include id here!
          guildId,
          adminRoleId: partialFields.adminRoleId ?? config.adminRoleId,
          adminUserIds: JSON.stringify(
            partialFields.adminUserIds ?? adminUserIds
          ),
          reportChannel: partialFields.reportChannel ?? config.reportChannel,
        })
        .onConflictDoUpdate({
          target: configs.guildId,
          set: {
            adminRoleId: partialFields.adminRoleId ?? config.adminRoleId,
            adminUserIds: JSON.stringify(
              partialFields.adminUserIds ?? adminUserIds
            ),
            reportChannel: partialFields.reportChannel ?? config.reportChannel,
          },
        });
    };

    // RoleSelect collector
    response.createMessageComponentCollector({
      componentType: ComponentType.RoleSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    }).on('collect', async (i) => {
      const selectedRoleId = i.values[0];
      config.adminRoleId = selectedRoleId;

      await upsertConfig({ adminRoleId: selectedRoleId });

      await i.update({
        content: `✅ Admin role set to <@&${selectedRoleId}>`,
        embeds: [generateEmbed()],
        components: [row1, row2, row3],
      });
    });

    // UserSelect collector
    response.createMessageComponentCollector({
      componentType: ComponentType.UserSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    }).on('collect', async (i) => {
      const selectedUserIds = i.values;
      adminUserIds = selectedUserIds;

      await upsertConfig({ adminUserIds: selectedUserIds });

      await i.update({
        content: `✅ Admin users updated.`,
        embeds: [generateEmbed()],
        components: [row1, row2, row3],
      });
    });

    // ChannelSelect collector
    response.createMessageComponentCollector({
      componentType: ComponentType.ChannelSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    }).on('collect', async (i) => {
      const selectedChannelId = i.values[0];
      config.reportChannel = selectedChannelId;

      await upsertConfig({ reportChannel: selectedChannelId });

      await i.update({
        content: `✅ Report channel set to <#${selectedChannelId}>`,
        embeds: [generateEmbed()],
        components: [row1, row2, row3],
      });
    });
  },
};