const { Client, GatewayIntentBits, Partials, Collection, InteractionType } = require('discord.js');
require('dotenv').config(); // remove if using Replit
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction,
  ],
});

client.commands = new Collection();
client.aliases = new Collection();
client.slashCommands = new Collection();
client.buttons = new Collection();
client.prefix = config.prefix;

module.exports = client;

// Load handlers
fs.readdirSync('./handlers').forEach((handler) => {
  require(`./handlers/${handler}`)(client);
});

// Login
client.login(process.env.DISCORD_TOKEN);

// ----------------------------------------
// ✅ GLOBAL ANTI-CRASH HANDLERS
// ----------------------------------------

process.on('unhandledRejection', (reason, promise) => {
  console.error('🟥 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🟥 Uncaught Exception:', err);
});

process.on('uncaughtExceptionMonitor', (err) => {
  console.error('🟥 Uncaught Exception Monitor:', err);
});

// Optional: Log client errors too
client.on('error', (err) => {
  console.error('🟥 Client Error:', err);
});

