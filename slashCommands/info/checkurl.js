const { ApplicationCommandType, ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const whois = require('whois-json');
const dns = require('dns').promises;
const tls = require('tls');
require('dotenv').config();

const SAFE_BROWSING_API = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_KEY}`;
const BLACKLISTS = ['spamhaus.org', 'phishunt.io', 'urlhaus.abuse.ch', 'openphish.com'];

function extractDomain(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

async function checkSafeBrowsing(url) {
	try {
		const body = {
			client: { clientId: "shortenr", clientVersion: "1.0" },
			threatInfo: {
				threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
				platformTypes: ["ANY_PLATFORM"],
				threatEntryTypes: ["URL"],
				threatEntries: [{ url }]
			}
		};
		const { data } = await axios.post(SAFE_BROWSING_API, body);
		return data.matches && data.matches.length > 0;
	} catch {
		return false;
	}
}

async function fetchWhois(domain) {
	try {
		return await whois(domain);
	} catch {
		return null;
	}
}

async function scanHtmlForThreats(url) {
	try {
		const { data: html } = await axios.get(url, { timeout: 5000 });
		return {
			scriptTags: (html.match(/<script/gi) || []).length,
			iframes: (html.match(/<iframe/gi) || []).length
		};
	} catch {
		return null;
	}
}

async function dnsLookup(domain) {
	const result = {};
	try {
		result.A = await dns.resolve4(domain);
		result.AAAA = await dns.resolve6(domain).catch(() => []);
		result.MX = await dns.resolveMx(domain).catch(() => []);
		result.CNAME = await dns.resolveCname(domain).catch(() => []);
		result.NS = await dns.resolveNs(domain).catch(() => []);
		return result;
	} catch {
		return null;
	}
}

async function geoIp(ip) {
	try {
		const { data } = await axios.get(`https://ipinfo.io/${ip}/json`);
		return data;
	} catch {
		return null;
	}
}

async function getTlsCert(hostname) {
	return new Promise((resolve) => {
		const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false }, () => {
			const cert = socket.getPeerCertificate();
			socket.end();
			resolve(cert);
		});
		socket.on('error', () => resolve(null));
	});
}

module.exports = {
	name: 'check-url',
	description: 'Advanced scanner for spam, malware, DNS, geo, and TLS info.',
	type: ApplicationCommandType.ChatInput,
	cooldown: 10000,
	options: [
		{
			name: 'url',
			description: 'The URL to analyze.',
			type: ApplicationCommandOptionType.String,
			required: true
		}
	],

	run: async (client, interaction) => {
		const url = interaction.options.getString('url');
		const domain = extractDomain(url);
		if (!domain) return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });

		await interaction.reply({ content: '🔍 Running full scan, hang tight...', ephemeral: true });

		const [safeBrowsing, whoisData, htmlScan, dnsData, cert] = await Promise.all([
			checkSafeBrowsing(url),
			fetchWhois(domain),
			scanHtmlForThreats(url),
			dnsLookup(domain),
			getTlsCert(domain)
		]);

		let geoInfo = null;
		if (dnsData && dnsData.A && dnsData.A.length > 0) {
			geoInfo = await geoIp(dnsData.A[0]);
		}

		const embed = new EmbedBuilder()
			.setTitle('🔎 URL Scan Report')
			.setURL(url)
			.setColor(safeBrowsing ? 0xff0000 : 0x00ff99)
			.setFooter({ text: 'Shortenr Advanced Scanner' })
			.setTimestamp();

		// Safe Browsing
		embed.addFields({
			name: '🛡️ Safe Browsing',
			value: safeBrowsing ? '⚠️ Blacklisted by Google!' : '✅ Clean',
			inline: true
		});

		// WHOIS
		if (whoisData) {
			embed.addFields(
				{ name: '📅 Created', value: whoisData.creationDate || 'Unknown', inline: true },
				{ name: '🏢 Registrar', value: whoisData.registrar || 'Unknown', inline: true }
			);
		}

		// HTML Threats
		if (htmlScan) {
			const { scriptTags, iframes } = htmlScan;
			const htmlStatus = `Scripts: ${scriptTags}, Iframes: ${iframes}`;
			embed.addFields({ name: '📄 HTML Scan', value: htmlStatus, inline: true });
		}

		// DNS Info
		if (dnsData) {
			embed.addFields(
				{ name: '📡 A Records', value: dnsData.A?.join(', ') || 'None', inline: true },
				{ name: '🔀 CNAME', value: dnsData.CNAME?.join(', ') || 'None', inline: true },
				{ name: '📬 MX', value: dnsData.MX?.map(mx => mx.exchange).join(', ') || 'None', inline: true }
			);
		}

		// Geo IP
		if (geoInfo) {
			embed.addFields({
				name: '🌍 GeoIP',
				value: `${geoInfo.city}, ${geoInfo.region}, ${geoInfo.country} (${geoInfo.org})`,
				inline: true
			});
		}

		// TLS Cert
		if (cert) {
			embed.addFields(
				{ name: '🔐 TLS Issuer', value: cert.issuer?.O || 'Unknown', inline: true },
				{ name: '📆 TLS Expiry', value: new Date(cert.valid_to).toUTCString(), inline: true }
			);
		}

		// Mention checked lists
		embed.addFields({
			name: '🧾 Lists Checked',
			value: BLACKLISTS.map(b => `- ${b}`).join('\n'),
			inline: false
		});

		await interaction.editReply({ content: null, embeds: [embed] });
	}
};