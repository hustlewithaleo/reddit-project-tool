import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandDefinitions, handleCommand } from './commands.js';

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (err) {
    console.error(`Error handling /${interaction.commandName}:`, err);
    try {
      const payload = { content: 'Something went wrong running that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (reportErr) {
      // The interaction itself may already be invalid/expired (e.g. it timed
      // out) — failing to report the error shouldn't take the whole bot down.
      console.error('Also failed to report the error back to Discord:', reportErr.message);
    }
  }
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

async function registerCommands() {
  const rest = new REST().setToken(config.discord.botToken);
  const route = config.discord.guildId
    ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
    : Routes.applicationCommands(config.discord.clientId);

  await rest.put(route, { body: commandDefinitions });
  console.log(
    config.discord.guildId
      ? 'Registered guild slash commands (instant).'
      : 'Registered global slash commands (may take up to an hour to appear).'
  );
}

export async function startBot() {
  await registerCommands();
  await client.login(config.discord.botToken);
  console.log('Discord bot logged in.');
}
