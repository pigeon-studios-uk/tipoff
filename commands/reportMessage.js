const { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const reports = require("../services/reports");
const t = require("../strings/en");

// Right-click a message › Apps › Report Message
module.exports = {
  level: "everyone",

  data: new ContextMenuCommandBuilder()
    .setName(t.commands.reportMessage.name)
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return reports.openForm(interaction, "message");
  }
};
