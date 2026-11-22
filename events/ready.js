const { Events, ActivityType } = require("discord.js");
const logger = require("../services/logger");
const config = require("../services/config");
const hosted = require("../utility/hosted");
const guilds = require("../services/guilds");
const { registerCommands } = require("../utility/registerCommands");

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    // the panel watches for this start-up line to mark the server as running
    logger.success(`Tipoff is online as ${client.user.tag}, in ${client.guilds.cache.size} server(s) on ${client.ws.shards.size} shard(s)`);
    client.user.setActivity({ name: "/help", type: ActivityType.Listening });

    // servers Tipoff joined or was removed from while it was offline
    try {
      const counts = await guilds.reconcile([...client.guilds.cache.keys()]);
      if (counts.added || counts.back || counts.gone) {
        logger.info(`Servers since last start: ${counts.added} new, ${counts.back} back, ${counts.gone} left`);
      }
    } catch (err) {
      logger.error(`Couldn't bring the server list up to date: ${err.stack || err}`);
    }

    hosted.onReady(client, { config, logger });

    try {
      const count = await registerCommands(client.commands);
      logger.success(count.where === "global"
        ? `Registered ${count.global} global command(s) and ${count.staff} in the staff server`
        : `Registered ${count.guild} command(s) in server ${count.where} only (COMMANDS_GUILD_ID) and ${count.staff} staff command(s)`);
    } catch (err) {
      logger.error(`Couldn't register commands: ${err.message}`);
    }
  }
};
