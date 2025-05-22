const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ApplicationCommandType,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  name: 'upload',
  description: 'Securely upload a file using the Shortenr website',
  cooldown: 3000,
  type: ApplicationCommandType.ChatInput,
  userPerms: [],
  botPerms: [],
  run: async (client, interaction) => {
    const uploadUrl = 'https://shortenr.me';

    const embed = new EmbedBuilder()
      .setTitle('🔐 Secure File Upload')
      .setDescription([
        `For your privacy, file uploads are **end-to-end encrypted** and must happen in your browser.`,
        ``,
        `Discord bots can’t access secure browser crypto modules, so handling uploads here wouldn’t be private.`,
        ``,
        `👉 Use the official Shortenr upload page to protect your data.`,
      ].join('\n'))
      .setColor('#00ffc8')
      .setTimestamp()
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: 'Shortenr File Privacy' });

    const actionRow = new ActionRowBuilder().addComponents([
      new ButtonBuilder()
        .setLabel('Go to Upload Page')
        .setURL(uploadUrl)
        .setStyle(ButtonStyle.Link),
    ]);

    return interaction.reply({
      embeds: [embed],
      components: [actionRow],
      ephemeral: true,
    });
  },
};