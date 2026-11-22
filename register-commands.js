// Registers Tipoff's commands without starting the bot: npm run register
const { Collection } = require("discord.js");
require("./services/config"); // loads .env
const logger = require("./services/logger");
const { loadCommands } = require("./utility/commandLoader");
const { registerCommands } = require("./utility/registerCommands");

const missing = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "STAFF_GUILD_ID"].filter(key => !process.env[key]);
if (missing.length) {
  logger.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

// extras (staff/) too, or registering would remove their commands from the staff server (utility/extras.js)
const extras = require("./utility/extras").load();
const commands = new Collection([...loadCommands(), ...(extras?.commands || [])].map(({ command }) => [command.data.name, command]));

registerCommands(commands)
  .then(count => logger.success(count.where === "global"
    ? `Registered ${count.global} global command(s) and ${count.staff} in the staff server`
    : `Registered ${count.guild} command(s) in server ${count.where} only, and ${count.staff} staff command(s)`))
  .catch(err => {
    logger.error(`Failed to register commands: ${err.message}`);
    process.exitCode = 1;
  });
