const { MessageFlags } = require("discord.js");
const settingsStore = require("../services/settings");
const m = require("../services/modals");
const ui = require("../services/ui");
const strings = require("../strings");

/**
 * The /setup forms, sent: "setup:channels", "setup:roles", "setup:reasons", "setup:limits", "setup:language". The
 * reply is private (a public reply would show the mod channel and role to everyone in the channel), and in the
 * language of whoever sent the form.
 */
module.exports = {
  prefix: "setup",
  level: "manage_server",

  async execute(interaction, [form]) {
    // answered within Discord's 3 seconds whatever happens next; refusals edit this reply
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const values = m.reader(interaction);
    const guildId = interaction.guildId;
    const actor = interaction.user.id;
    const t = strings.forUser(interaction);
    const s = t.setup;

    if (form === "channels") {
      const report = values.channel("report");
      if (!report) return ui.reply(interaction, ui.error(t.setup.problems.noChannel, t.errors.title));
      const urgent = values.roles("urgent")[0] || null;
      await settingsStore.saveChannels(guildId, actor, {
        report, user: values.channel("user"), escalation: values.channel("escalation"), urgentRole: urgent,
        anonymous: values.checked("options").includes("anonymous")
      });
    } else if (form === "roles") {
      await settingsStore.saveRoles(guildId, actor, { moderators: values.roles("moderators"), staff: values.roles("staff") });
    } else if (form === "reasons") {
      const server = strings.forServer(await settingsStore.get(guildId), interaction.guild);
      const reasons = settingsStore.parseReasons(values.text("reasons"), { strings: t, others: [server.otherReason] });
      await settingsStore.saveReasons(guildId, actor, reasons);
    } else if (form === "limits") {
      const options = values.checked("options");
      const limits = {
        reporterCooldown: settingsStore.parseLimit("reporter_cooldown_minutes", values.text("reporterCooldown"), s.reporterCooldown, t),
        maxOpen: settingsStore.parseLimit("max_open_reports", values.text("maxOpen"), s.maxOpen, t),
        urgentCooldown: settingsStore.parseLimit("urgent_cooldown_minutes", values.text("urgentCooldown"), s.urgentCooldown, t),
        retention: settingsStore.parseLimit("retention_days", values.text("retention"), s.retention, t),
        outcomeDms: options.includes("outcomeDms"),
        closePosts: options.includes("closePosts")
      };
      await settingsStore.saveLimits(guildId, actor, limits);
    } else if (form === "language") {
      const picked = values.selected("language")[0];
      // "auto" (or anything Tipoff has no file for) = the server's own Discord language
      await settingsStore.saveLanguage(guildId, actor, picked && picked !== "auto" ? picked : null);
    } else {
      return ui.reply(interaction, ui.error(t.errors.expired, t.errors.title));
    }

    const settings = await settingsStore.get(guildId);
    return ui.reply(interaction, await require("../commands/setup").checkReply(interaction, settings, { heading: s.saved }));
  }
};
