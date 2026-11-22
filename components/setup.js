const { MessageFlags } = require("discord.js");
const settingsStore = require("../services/settings");
const m = require("../services/modals");
const ui = require("../services/ui");
const t = require("../strings/en");

/**
 * The /setup forms, sent: "setup:channels", "setup:roles", "setup:reasons", "setup:limits". The reply is private
 * (a public reply would show the mod channel and role to everyone in the channel).
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
    const s = t.setup;

    if (form === "channels") {
      const report = values.channel("report");
      if (!report) return ui.reply(interaction, ui.error(t.setup.problems.noChannel));
      const urgent = values.roles("urgent")[0] || null;
      await settingsStore.saveChannels(guildId, actor, {
        report, user: values.channel("user"), escalation: values.channel("escalation"), urgentRole: urgent,
        anonymous: values.checked("options").includes("anonymous")
      });
    } else if (form === "roles") {
      await settingsStore.saveRoles(guildId, actor, { moderators: values.roles("moderators"), staff: values.roles("staff") });
    } else if (form === "reasons") {
      const reasons = settingsStore.parseReasons(values.text("reasons"));
      await settingsStore.saveReasons(guildId, actor, reasons);
    } else if (form === "limits") {
      const options = values.checked("options");
      const limits = {
        reporterCooldown: settingsStore.parseLimit("reporter_cooldown_minutes", values.text("reporterCooldown"), s.reporterCooldown),
        maxOpen: settingsStore.parseLimit("max_open_reports", values.text("maxOpen"), s.maxOpen),
        urgentCooldown: settingsStore.parseLimit("urgent_cooldown_minutes", values.text("urgentCooldown"), s.urgentCooldown),
        retention: settingsStore.parseLimit("retention_days", values.text("retention"), s.retention),
        outcomeDms: options.includes("outcomeDms"),
        closePosts: options.includes("closePosts")
      };
      await settingsStore.saveLimits(guildId, actor, limits);
    } else {
      return ui.reply(interaction, ui.error(t.errors.expired));
    }

    const settings = await settingsStore.get(guildId);
    return ui.reply(interaction, await require("../commands/setup").checkReply(interaction, settings, { heading: s.saved }));
  }
};
