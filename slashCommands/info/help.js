const {
  ApplicationCommandType,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  name: 'help',
  description: '📘 Learn about this bot and its features.',
  type: ApplicationCommandType.ChatInput,

  run: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Shortenr Bot Help')
      .setDescription(`Shortenr is your trusted link-shortening and file-sharing assistant, powered by **[Shortenr.me](https://shortenr.me)**.\n\nIt helps you manage URLs, upload files, and fight against dodgy links using advanced moderation tech. Here's everything you can do:`)
      .setColor(0x5865F2)
      .setThumbnail('https://shortenr.me/favicon.ico')
      .addFields(
        {
          name: '🔗 /shorten',
          value: 'Shorten a link (10 links/day per user).',
        },
        {
          name: '📎 /links',
          value: 'View all your shortened links.',
        },
        {
          name: '📤 /upload',
          value: 'Upload **1 file every 7 days** (max 8MB).',
        },
        {
          name: '📁 /files',
          value: 'See your uploaded files.',
        },
        {
          name: '📡 /ping',
          value: 'Check bot response time.',
        },
        {
          name: '🧠 /analyze',
          value: 'Advanced link scanner – checks for disposable URLs, redirection tricks, and more.',
        },
        {
          name: '🕵️ /checkdomain',
          value: 'Check domain age before trusting a link. Blocks sketchy new domains.',
        },
        {
          name: '⛔ /flag',
          value: 'Manually flag a suspicious link for review by the Shortenr team.',
        },
        {
          name: '📜 /rules',
          value: 'Guild owners: Set custom link rules, whitelists/blacklists, or regex filters.',
        },
        {
          name: '💻 /blocklan',
          value: 'Detect and block links to private IPs (e.g. `localhost`, `192.168.*`, `10.0.0.1`).',
        },
      )
      .setFooter({ text: 'Need more power? Unlock higher limits & premium features at Shortenr.me 🚀' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};