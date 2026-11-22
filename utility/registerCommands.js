const { REST, Routes } = require("discord.js");
const config = require("../services/config");

/**
 * Tipoff's commands go to Discord in two sets (utility/commandLoader.js, scope):
 *
 *   global  every server Tipoff is in. Global commands reach new servers without registering again.
 *   staff   the staff server only (STAFF_GUILD_ID): a copy's own tools, from hosted/ or staff/. Without
 *           STAFF_GUILD_ID there's no staff server, so they aren't registered at all.
 *
 * The test bot sets COMMANDS_GUILD_ID: then the global set goes to that one server instead (changes show at once,
 * and the test bot's commands never appear anywhere else), and the global list is emptied.
 *
 * Each PUT replaces its whole set, so removed commands disappear too. Runs on every start, and with npm run register.
 */

/** The { global, staff } request bodies. Exported for tests. */
function payloads(commands) {
  const global = [];
  const staff = [];
  for (const command of commands.values()) (command.scope === "staff" ? staff : global).push(command.data.toJSON());
  return { global, staff };
}

async function registerCommands(commands, { rest = new REST({ version: "10" }).setToken(config.discord.token), discord = config.discord } = {}) {
  const { global } = payloads(commands);
  const staff = discord.staffGuildId ? payloads(commands).staff : [];
  const app = discord.clientId;

  if (discord.commandsGuildId) {
    // test bot: everything in one server. The staff commands join them there if it's the same server.
    const sameServer = discord.commandsGuildId === discord.staffGuildId;
    await rest.put(Routes.applicationCommands(app), { body: [] });
    await rest.put(Routes.applicationGuildCommands(app, discord.commandsGuildId), { body: sameServer ? [...global, ...staff] : global });
    if (!sameServer && discord.staffGuildId) await rest.put(Routes.applicationGuildCommands(app, discord.staffGuildId), { body: staff });
    return { global: 0, guild: global.length, staff: staff.length, where: discord.commandsGuildId };
  }

  await rest.put(Routes.applicationCommands(app), { body: global });
  if (discord.staffGuildId) await rest.put(Routes.applicationGuildCommands(app, discord.staffGuildId), { body: staff });
  return { global: global.length, guild: 0, staff: staff.length, where: "global" };
}

module.exports = { registerCommands, payloads };
