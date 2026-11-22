const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, MessageFlags } = require("discord.js");
const config = require("../services/config");
const stats = require("../services/stats");
const settingsStore = require("../services/settings");
const ui = require("../services/ui");
const t = require("../strings/en");

// /privacy: what Tipoff keeps about you in this server, and how to get it copied or deleted
module.exports = {
  level: "everyone",

  data: new SlashCommandBuilder()
    .setName(t.commands.privacy.name)
    .setDescription(t.commands.privacy.description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [held, settings] = await Promise.all([stats.aboutPerson(interaction.guildId, interaction.user.id), settingsStore.get(interaction.guildId)]);
    const p = t.privacy;
    return ui.reply(interaction, ui.card({
      sections: [
        [p.title, p.asReporter(held.reported), p.asTarget(held.about), held.handled ? p.asModerator(held.handled) : null, held.blocked ? p.blocked : null].filter(Boolean).join("\n"),
        "---",
        `${p.rules(settings.retentionDays)}\n${p.cards}`,
        p.request(config.links.privacy)
      ],
      buttons: [{ label: t.help.buttons.privacy, url: config.links.privacy }, { label: t.help.buttons.support, url: config.links.support }]
    }));
  }
};
