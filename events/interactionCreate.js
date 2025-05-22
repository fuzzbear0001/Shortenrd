const { EmbedBuilder, Collection, PermissionsBitField, InteractionType } = require('discord.js');
const ms = require('ms');
const client = require('..');
const config = require('../config.json');

const cooldown = new Collection();

client.on('interactionCreate', async interaction => {
  const slashCommand = client.slashCommands.get(interaction.commandName);
  try {
    // Handle autocomplete safely
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      if (slashCommand?.autocomplete) {
        const choices = [];
        await slashCommand.autocomplete(interaction, choices).catch(console.error);
      }
      return;
    }

    // Exit if not a command
    if (interaction.type !== InteractionType.ApplicationCommand || !slashCommand) return;

    // Delete command if it no longer exists
    if (!slashCommand) {
      client.slashCommands.delete(interaction.commandName);
      return;
    }

    // Handle cooldown
    const cooldownKey = `slash-${slashCommand.name}-${interaction.user.id}`;
    if (slashCommand.cooldown) {
      const existingCooldown = cooldown.get(cooldownKey);
      if (existingCooldown && Date.now() < existingCooldown) {
        const remaining = ms(existingCooldown - Date.now(), { long: true });
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: config.messages["COOLDOWN_MESSAGE"].replace('<duration>', remaining),
            ephemeral: true,
          }).catch(() => {});
        } else {
          return interaction.followUp({
            content: config.messages["COOLDOWN_MESSAGE"].replace('<duration>', remaining),
            ephemeral: true,
          }).catch(() => {});
        }
      }

      cooldown.set(cooldownKey, Date.now() + slashCommand.cooldown);
      setTimeout(() => cooldown.delete(cooldownKey), slashCommand.cooldown);
    }

    // Permissions check
    const missingUserPerms = slashCommand.userPerms && !interaction.memberPermissions.has(PermissionsBitField.resolve(slashCommand.userPerms));
    const missingBotPerms = slashCommand.botPerms && !interaction.guild.members.me.permissions.has(PermissionsBitField.resolve(slashCommand.botPerms));

    if (missingUserPerms) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription(`🚫 ${interaction.user}, you need \`${slashCommand.userPerms}\` permissions to use this command!`);
      return safeReply(interaction, { embeds: [embed], ephemeral: true });
    }

    if (missingBotPerms) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription(`🚫 I need \`${slashCommand.botPerms}\` permissions to run this command!`);
      return safeReply(interaction, { embeds: [embed], ephemeral: true });
    }

    // Run the actual command
    await slashCommand.run(client, interaction);

  } catch (err) {
    console.error('🟥 Interaction Error:', err);
    safeReply(interaction, {
      content: '❌ An unexpected error occurred while processing this command.',
      ephemeral: true,
    });
  }
});

/**
 * Safe reply or follow-up to prevent crashes from InteractionAlreadyReplied
 */
async function safeReply(interaction, payload) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
    } else {
      await interaction.followUp(payload);
    }
  } catch (e) {
    console.error('🟥 Safe reply failed:', e);
  }
}