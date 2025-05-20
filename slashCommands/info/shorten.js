const { ApplicationCommandType, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const prisma = require('../../lib/prisma');

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
		const userId = interaction.user.id;
		const guildId = interaction.guildId;
		const url = interaction.options.getString('url');

		// Fetch or create user in DB
		let user = await prisma.user.findUnique({ where: { id: userId } });
		const today = new Date().toISOString().split('T')[0];

		if (!user) {
			user = await prisma.user.create({
				data: {
					id: userId,
					linkCount: 1,
					lastUsedDate: new Date(),
					totalLinks: 1,
				},
			});
		} else {
			const lastUsed = user.lastUsedDate.toISOString().split('T')[0];
			if (lastUsed === today) {
				if (user.linkCount >= 3) {
					return interaction.reply({
						content: '⚠️ You have reached your daily limit of 3 shortened links.',
						ephemeral: true,
					});
				}
				await prisma.user.update({
					where: { id: userId },
					data: {
						linkCount: { increment: 1 },
						totalLinks: { increment: 1 },
					},
				});
			} else {
				await prisma.user.update({
					where: { id: userId },
					data: {
						linkCount: 1,
						lastUsedDate: new Date(),
						totalLinks: { increment: 1 },
					},
				});
			}
		}

		// Shorten URL using API
		try {
			const res = await axios.post(
				'https://shortenr.me/api/discord/shorten',
				{ url },
				{
					headers: {
						Authorization: process.env.ShortenrApiKey,
					},
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
				ephemeral: false,
			});
		} catch (error) {
			console.error('Shorten API error:', error);
			return interaction.reply({
				content: '❌ Failed to shorten the URL. Please try again later.',
				ephemeral: true,
			});
		}
	},
};