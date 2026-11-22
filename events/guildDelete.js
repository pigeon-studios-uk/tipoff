const { Events } = require("discord.js");
const logger = require("../services/logger");
const guilds = require("../services/guilds");

/**
 * Tipoff was removed from a server, or the server became unavailable. Only a real removal counts: during a Discord
 * outage the server is "unavailable" and nothing changes, so an outage never wipes a working server. A removal only
 * marks the server as left; its data is deleted 30 days later, and comes back if Tipoff is re-added before then.
 */
module.exports = {
  name: Events.GuildDelete,

  async execute(guild) {
    if (!guild?.id || guild.available === false) {
      logger.warn(`A server became unavailable (${guild?.id}); keeping everything`);
      return;
    }
    await guilds.left(guild.id);
    logger.info(`Removed from a server (${guild.id}); its data is kept for ${guilds.KEEP_AFTER_LEAVING_DAYS} days`);
  }
};
