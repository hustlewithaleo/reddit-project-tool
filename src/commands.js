import { SlashCommandBuilder } from 'discord.js';
import { store } from './store.js';
import { config } from './config.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('keyword-add')
    .setDescription('Add a keyword to watch for in new Reddit posts')
    .addStringOption((opt) =>
      opt.setName('word').setDescription('Keyword or phrase').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('keyword-remove')
    .setDescription('Stop watching for a keyword')
    .addStringOption((opt) =>
      opt.setName('word').setDescription('Keyword or phrase').setRequired(true)
    ),
  new SlashCommandBuilder().setName('keyword-list').setDescription('List watched keywords'),

  new SlashCommandBuilder()
    .setName('subreddit-add')
    .setDescription('Add a subreddit to monitor')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Subreddit name, without r/').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('subreddit-remove')
    .setDescription('Stop monitoring a subreddit')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Subreddit name, without r/').setRequired(true)
    ),
  new SlashCommandBuilder().setName('subreddit-list').setDescription('List monitored subreddits'),
  new SlashCommandBuilder()
    .setName('subreddit-add-bulk')
    .setDescription('Add many subreddits at once')
    .addStringOption((opt) =>
      opt
        .setName('names')
        .setDescription('Comma-separated subreddit names, without r/')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('set-course-channel')
    .setDescription('Post course-seeker leads to the channel this command is run in'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show current scraper configuration'),
].map((c) => c.toJSON());

export async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case 'keyword-add': {
      const word = interaction.options.getString('word');
      const added = store.addKeyword(word);
      await interaction.reply(
        added ? `Added keyword: **${word}**` : `Already watching: **${word}**`
      );
      break;
    }
    case 'keyword-remove': {
      const word = interaction.options.getString('word');
      const removed = store.removeKeyword(word);
      await interaction.reply(
        removed ? `Removed keyword: **${word}**` : `Wasn't watching: **${word}**`
      );
      break;
    }
    case 'keyword-list': {
      const keywords = store.getKeywords();
      await interaction.reply(
        keywords.length ? `Watched keywords: ${keywords.map((k) => `\`${k}\``).join(', ')}` : 'No keywords set yet.'
      );
      break;
    }

    case 'subreddit-add': {
      const name = interaction.options.getString('name');
      const added = store.addSubreddit(name);
      const clean = name.trim().toLowerCase().replace(/^r\//, '');
      await interaction.reply(
        added ? `Now monitoring r/${clean}` : `Already monitoring r/${clean}`
      );
      break;
    }
    case 'subreddit-remove': {
      const name = interaction.options.getString('name');
      const removed = store.removeSubreddit(name);
      const clean = name.trim().toLowerCase().replace(/^r\//, '');
      await interaction.reply(
        removed ? `Stopped monitoring r/${clean}` : `Wasn't monitoring r/${clean}`
      );
      break;
    }
    case 'subreddit-list': {
      const subs = store.getSubreddits();
      await interaction.reply(
        subs.length ? `Monitored subreddits: ${subs.map((s) => `r/${s}`).join(', ')}` : 'No subreddits set yet.'
      );
      break;
    }
    case 'subreddit-add-bulk': {
      const names = interaction.options.getString('names').split(',').map((s) => s.trim()).filter(Boolean);
      let added = 0;
      for (const name of names) {
        if (store.addSubreddit(name)) added++;
      }
      await interaction.reply(`Added ${added} new subreddit(s). Monitoring ${store.getSubreddits().length} total.`);
      break;
    }

    case 'set-course-channel': {
      store.setCourseChannelId(interaction.channelId);
      await interaction.reply('This channel will now receive course-seeker leads.');
      break;
    }
    case 'status': {
      const subs = store.getSubreddits();
      const keywords = store.getKeywords();
      const courseChannelId = store.getCourseChannelId();
      await interaction.reply(
        [
          `**Subreddits:** ${subs.length ? subs.map((s) => `r/${s}`).join(', ') : 'none'}`,
          `**Keywords:** ${keywords.length ? keywords.map((k) => `\`${k}\``).join(', ') : 'none'}`,
          `**Course-lead channel:** ${courseChannelId ? `<#${courseChannelId}>` : 'not set — run /set-course-channel here'}`,
          `**Reddit (posts + comments, via Arctic Shift):** every 5 min`,
          `**Twitter/X:** ${config.twitter.apiKey ? 'every 5 min' : 'disabled — no TWITTERAPI_KEY set'}`,
          `**Lead classification (Claude):** ${config.anthropic.apiKey ? 'enabled' : 'disabled — no ANTHROPIC_API_KEY set, nothing will be posted'}`,
        ].join('\n')
      );
      break;
    }
  }
}
