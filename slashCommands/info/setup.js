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
      try {
        // Always defer update immediately to prevent "This interaction failed"
        await i.deferUpdate();

        if (i.customId === 'select_admin_role') {
          const selectedRoleId = i.values[0];
          const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
          const botMember = interaction.guild.members.me;

          if (!selectedRole) {
            return await i.followUp({
              content: '❌ Selected role not found.',
              ephemeral: true,
            });
          }

          // Check bot role is higher than selected role
          if (selectedRole.position >= botMember.roles.highest.position) {
            return await i.followUp({
              content: '❌ My role must be higher than the selected admin role.',
              ephemeral: true,
            });
          }

          config.adminRoleId = selectedRoleId;

          await db
            .insert(configs)
            .values({
              id: guildId,
              guildId,
              adminRoleId: selectedRoleId,
              adminUserIds: JSON.stringify(adminUserIds),
              reportChannel: config.reportChannel || null,
            })
            .onConflictDoUpdate({
              target: configs.guildId,
              set: { adminRoleId: selectedRoleId },
            })
            .execute();

          embed.spliceFields(0, 1, {
            name: 'Admin Role',
            value: `<@&${selectedRoleId}>`,
            inline: true,
          });

          await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });

        } else if (i.customId === 'select_admin_users') {
          const selectedUserIds = i.values;

          // Toggle each selected user: add if not present, remove if present
          for (const userId of selectedUserIds) {
            const index = adminUserIds.indexOf(userId);
            if (index > -1) {
              adminUserIds.splice(index, 1);
            } else {
              adminUserIds.push(userId);
            }
          }

          await db
            .insert(configs)
            .values({
              id: guildId,
              guildId,
              adminRoleId: config.adminRoleId,
              adminUserIds: JSON.stringify(adminUserIds),
              reportChannel: config.reportChannel || null,
            })
            .onConflictDoUpdate({
              target: configs.guildId,
              set: { adminUserIds: JSON.stringify(adminUserIds) },
            })
            .execute();

          embed.spliceFields(1, 1, {
            name: 'Admin Users',
            value: adminUserIds.length ? adminUserIds.map(id => `<@${id}>`).join('\n') : 'No admins set',
            inline: true,
          });

          await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });

        } else if (i.customId === 'select_report_channel') {
          const selectedChannelId = i.values[0];

          config.reportChannel = selectedChannelId;

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

          embed.spliceFields(2, 1, {
            name: 'Report Channel',
            value: `<#${selectedChannelId}>`,
            inline: true,
          });

          await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
        }
      } catch (err) {
        console.error('Interaction error:', err);
        if (!i.replied && !i.deferred) {
          try {
            await i.reply({
              content: '❌ Something went wrong during setup.',
              ephemeral: true,
            });
          } catch {}
        }
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          content: '✅ Setup session ended.',
          embeds: [embed],
          components: [],
        });
      } catch (e) {
        console.error('Failed to end setup session:', e.message);
      }
    });
  },
};