const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const reports = require("../services/reports");
const t = require("../strings/en");

// /report: anything that isn't one message or one member, with up to 5 screenshots
module.exports = {
  level: "everyone",

  data: new SlashCommandBuilder()
    .setName(t.commands.report.name)
    .setDescription(t.commands.report.description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return reports.openForm(interaction, "general");
  }
};
