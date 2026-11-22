const { Events } = require("discord.js");
const logger = require("../services/logger");
const guilds = require("../services/guilds");

/** Tipoff was added to a server (or added back within the 30 days, which keeps its settings and cases). */
module.exports = {
  name: Events.GuildCreate,

  async execute(guild) {
    await guilds.joined(guild.id);
    logger.info(`Added to a server (${guild.id}, ${guild.memberCount ?? "?"} members)`);
  }
};
