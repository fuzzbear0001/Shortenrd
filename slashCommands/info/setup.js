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

    // Fetch existing config from DB
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
        'Configure admin role, admin users, and report channel.\n\n**Note:** Bot must have a role higher than the admin role.'
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
        .setChannelTypes([ChannelType.GuildText])
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
      ephemeral: true,
    });

    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (i) => {
      try {
        if (!i.deferred && !i.replied) await i.deferUpdate();

        if (i.customId === 'select_admin_role') {
          const selectedRoleId = i.values[0];
          const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
          const botMember = interaction.guild.members.me;

          if (!selectedRole) {
            return i.followUp({
              content: '❌ The selected role no longer exists.',
              ephemeral: true,
            });
          }

          if (selectedRole.position >= botMember.roles.highest.position) {
            return i.followUp({
              content: '❌ My role must be above the selected admin role.',
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
              target: ['guildId'],
              set: {
                adminRoleId: selectedRoleId,
                adminUserIds: JSON.stringify(adminUserIds),
                reportChannel: config.reportChannel || null,
              },
            })
            .execute();

          embed.spliceFields(0, 1, {
            name: 'Admin Role',
            value: `<@&${selectedRoleId}>`,
            inline: true,
          });

          await i.editReply({ embeds: [embed], components: [row1, row2, row3] });
        } else if (i.customId === 'select_admin_users') {
          const selectedUserIds = i.values;

          // Toggle users: remove if present, add if not
          for (const userId of selectedUserIds) {
            if (adminUserIds.includes(userId)) {
              adminUserIds = adminUserIds.filter((id) => id !== userId);
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
              target: ['guildId'],
              set: {
                adminRoleId: config.adminRoleId,
                adminUserIds: JSON.stringify(adminUserIds),
                reportChannel: config.reportChannel || null,
              },
            })
            .execute();

          embed.spliceFields(1, 1, {
            name: 'Admin Users',
            value: adminUserIds.length
              ? adminUserIds.map((id) => `<@${id}>`).join('\n')
              : 'No admins set',
            inline: true,
          });

          await i.editReply({ embeds: [embed], components: [row1, row2, row3] });
        } else if (i.customId === 'select_report_channel') {
          const selectedChannelId = i.values[0];
          const channel = interaction.guild.channels.cache.get(selectedChannelId);

          if (!channel || channel.type !== ChannelType.GuildText) {
            return i.followUp({
              content: '❌ Please select a valid text channel.',
              ephemeral: true,
            });
          }

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
              target: ['guildId'],
              set: {
                adminRoleId: config.adminRoleId,
                adminUserIds: JSON.stringify(adminUserIds),
                reportChannel: selectedChannelId,
              },
            })
            .execute();

          embed.spliceFields(2, 1, {
            name: 'Report Channel',
            value: `<#${selectedChannelId}>`,
            inline: true,
          });

          await i.editReply({ embeds: [embed], components: [row1, row2, row3] });
        }
      } catch (err) {
        console.error(`Interaction error: ${err.stack || err.message}`);
        if (!i.replied && !i.deferred) {
          try {
            await i.reply({ content: '❌ Something went wrong during setup.', ephemeral: true });
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