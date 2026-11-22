const { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const reports = require("../services/reports");
const t = require("../strings/en");

// Right-click a member › Apps › Report User
module.exports = {
  level: "everyone",

  data: new ContextMenuCommandBuilder()
    .setName(t.commands.reportUser.name)
    .setType(ApplicationCommandType.User)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return reports.openForm(interaction, "user");
  }
};
