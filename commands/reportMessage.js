const { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const reports = require("../services/reports");
const { named } = require("../utility/localize");

// Right-click a message › Apps › Report Message
module.exports = {
  level: "everyone",

  // the name people see in the Apps menu, in their own language
  data: named(new ContextMenuCommandBuilder(), s => s.commands.reportMessage.name)
    .setType(ApplicationCommandType.Message)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return reports.openForm(interaction, "message");
  }
};
