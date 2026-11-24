const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const reports = require("../services/reports");
const en = require("../strings/en");
const { describe } = require("../utility/localize");

// /report: anything that isn't one message or one member, with up to 5 screenshots
module.exports = {
  level: "everyone",

  data: describe(new SlashCommandBuilder().setName(en.commands.report.name), s => s.commands.report.description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return reports.openForm(interaction, "general");
  }
};
