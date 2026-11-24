const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");
const config = require("../services/config");
const ui = require("../services/ui");
const strings = require("../strings");
const en = require("../strings/en");
const { describe } = require("../utility/localize");

/** The /help card, in t's language. Links that aren't live yet (services/config.js, links) are left out. Exported for tests. */
function helpCard(links = config.links, t = en) {
  const h = t.help;
  return ui.card({
    sections: [
      `## ${h.title}\n${t.tagline}`,
      "---",
      [`### ${h.reportHeading}`, h.reportMessage, h.reportUser, h.reportOther].join("\n"),
      [`### ${h.adminHeading}`, h.adminSetup].join("\n"),
      "---",
      h.discordSafety(links.discordSafety)
    ],
    buttons: [
      { label: h.buttons.guide, url: links.guide },
      { label: h.buttons.privacy, url: links.privacy },
      { label: h.buttons.support, url: links.support },
      { label: h.buttons.website, url: links.website }
    ]
  });
}

module.exports = {
  level: "everyone",
  helpCard,

  data: describe(new SlashCommandBuilder().setName(en.commands.help.name), s => s.commands.help.description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    return ui.reply(interaction, helpCard(config.links, strings.forUser(interaction)));
  }
};
