const { ApplicationCommandType, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { dbPromise } = require('../../drizzle/db.js');
const { users } = require('../../drizzle/schema.js');
const { eq } = require('drizzle-orm');

module.exports = {
	name: 'shorten',
	description: 'Shorten a URL using Shortenr',
	type: ApplicationCommandType.ChatInput,
	cooldown: 3000,
	options: [
		{
			name: 'url',
			description: 'The URL to shorten',
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	],
	run: async (client, interaction) => {
		const db = await dbPromise;
		const userId = interaction.user.id;
		const url = interaction.options.getString('url');
		const today = new Date().toISOString().split('T')[0];

		const existingUser = await db.select().from(users).where(eq(users.id, userId)).then(rows => rows[0]);

		if (!existingUser) {
			await db.insert(users).values({
				id: userId,
				linkCount: 1,
				lastUsedDate: new Date(),
				totalLinks: 1,
			});
		} else {
			const lastUsed = existingUser.lastUsedDate.toISOString().split('T')[0];
			if (lastUsed === today) {
				if (existingUser.linkCount >= 3) {
					return interaction.reply({
						content: '⚠️ You have reached your daily limit of 3 shortened links.',
						ephemeral: true,
					});
				}
				await db.update(users)
					.set({
						linkCount: existingUser.linkCount + 1,
						totalLinks: existingUser.totalLinks + 1,
					})
					.where(eq(users.id, userId));
			} else {
				await db.update(users)
					.set({
						linkCount: 1,
						lastUsedDate: new Date(),
						totalLinks: existingUser.totalLinks + 1,
					})
					.where(eq(users.id, userId));
			}
		}

		try {
			const res = await axios.post(
				'https://shortenr.me/api/discord/shorten',
				{ url },
				{
					headers: {
						Authorization: process.env.ShortenrApiKey,
					}
				}
			);

			const shortened = res.data?.shortened || 'Unknown';
			const embed = new EmbedBuilder()
				.setTitle('🔗 Link Shortened')
				.setDescription(`**Original:** [${url}](${url})\n**Shortened:** [${shortened}](${shortened})`)
				.setColor(0x2f3136)
				.setTimestamp();

			const buttons = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setLabel('Visit')
					.setStyle(ButtonStyle.Link)
					.setURL(shortened),
				new ButtonBuilder()
					.setCustomId('copy_link')
					.setLabel('Copy Link')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('report_link')
					.setLabel('Report')
					.setStyle(ButtonStyle.Danger)
			);

			return interaction.reply({
				embeds: [embed],
				components: [buttons],
			});
		} catch (err) {
			console.error('Shorten API error:', err);
			return interaction.reply({
				content: '❌ Failed to shorten the URL. Please try again later.',
				ephemeral: true,
			});
		}
	}
};