const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { dbPromise } = require('../../drizzle/db');
const { disposableUrls } = require('../../drizzle/schema');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer-core');
const which = require('which');

module.exports = {
  name: 'check-url',
  description: 'Checks if a URL is dynamically resolving.',
  type: ApplicationCommandType.ChatInput,
  cooldown: 10000,
  options: [
    {
      name: 'url',
      description: 'The URL to test.',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  run: async (client, interaction) => {
    const url = interaction.options.getString('url');
    const db = await dbPromise;

    await interaction.reply({ content: '🔍 Checking URL behavior, please wait...', ephemeral: true });

    // Find Chrome executable path on your system:
    let chromePath;
    try {
      chromePath = which.sync('google-chrome') || which.sync('chromium-browser') || which.sync('chromium');
    } catch {
      return interaction.editReply({
        content:
          '❌ Could not find Chrome/Chromium installed on the system. Please install it or run with required dependencies.',
        ephemeral: true,
      });
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // safer for some servers
    });

    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const firstUrl = page.url();

      await page.deleteCookie(...(await page.cookies()));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const secondUrl = page.url();

      const isDisposable = firstUrl !== secondUrl;

      await db.insert(disposableUrls).values({
        id: uuidv4(),
        originalUrl: url,
        firstResolvedUrl: firstUrl,
        secondResolvedUrl: secondUrl,
        isDisposable,
        detectedAt: new Date().toISOString(),
      });

      await interaction.editReply({
        content: isDisposable
          ? '⚠️ This link appears to be dynamically resolving to multiple destinations!'
          : '✅ This link resolves consistently.',
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: '❌ Failed to check the URL. It may be invalid or unreachable.',
        ephemeral: true,
      });
    } finally {
      await browser.close();
    }
  },
};