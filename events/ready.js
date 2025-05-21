const { ActivityType } = require('discord.js');
const client = require('..');
const chalk = require('chalk');

client.on("ready", () => {
	console.log(chalk.green(`✅ Logged in as ${client.user.tag} for Shortenr.me`));

	// Set bot status to 'online'
	client.user.setStatus('online');

	// Professional activity messages
	const activities = [
		{ name: `Shortenr.me | ${client.guilds.cache.size} servers`, type: ActivityType.Watching },
		{ name: `Optimizing ${client.channels.cache.size} channels`, type: ActivityType.Playing },
		{ name: `Serving ${client.users.cache.size} users`, type: ActivityType.Listening },
		{ name: `Links, Analytics & Servers`, type: ActivityType.Watching }
	];

	let i = 0;
	setInterval(() => {
		client.user.setActivity(activities[i]);
		i = (i + 1) % activities.length;
	}, 10000); // Update every 10 seconds
});