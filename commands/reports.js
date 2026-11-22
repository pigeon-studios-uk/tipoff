const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ApplicationIntegrationType, MessageFlags } = require("discord.js");
const stats = require("../services/stats");
const limits = require("../services/limits");
const settingsStore = require("../services/settings");
const permissions = require("../services/permissions");
const ui = require("../services/ui");
const t = require("../strings/en");

const PERIODS = [7, 30, 90, 365];
const refused = text => Object.assign(new Error(text), { userMessage: text });

module.exports = {
  level: "moderator",
  PERIODS,

  data: new SlashCommandBuilder()
    .setName(t.commands.reports.name)
    .setDescription(t.commands.reports.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub => sub.setName("user").setDescription(t.commands.reports.user)
      .addUserOption(o => o.setName("member").setDescription(t.commands.reports.member).setRequired(true)))
    .addSubcommand(sub => sub.setName("stats").setDescription(t.commands.reports.stats)
      .addIntegerOption(o => o.setName("period").setDescription(t.commands.reports.period)
        .addChoices(...PERIODS.map(days => ({ name: t.reportsView.periods[days], value: days })))))
    .addSubcommand(sub => sub.setName("block").setDescription(t.commands.reports.block)
      .addUserOption(o => o.setName("member").setDescription(t.commands.reports.member).setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription(t.commands.reports.reason).setMaxLength(500)))
    .addSubcommand(sub => sub.setName("unblock").setDescription(t.commands.reports.unblock)
      .addUserOption(o => o.setName("member").setDescription(t.commands.reports.member).setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const v = t.reportsView;

    if (sub === "stats") {
      const days = interaction.options.getInteger("period") || 30;
      const s = await stats.forGuild(guildId, days);
      const reasons = s.reasons.length ? `**${v.byReason}**\n${s.reasons.map(r => `${r.reason}: ${r.n}`).join("\n")}` : null;
      return ui.reply(interaction, ui.card({
        sections: [v.statsTitle(days), v.stats({ ...s, toClaim: s.toClaim || v.notEnough, toClose: s.toClose || v.notEnough }), reasons]
      }));
    }

    const user = interaction.options.getUser("member");
    const who = `<@${user.id}>`;

    if (sub === "user") {
      const rows = await stats.casesAbout(guildId, user.id);
      const lines = rows.map(r => v.line(r.number, r.reason, t.card.status[r.status], `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`));
      return ui.reply(interaction, ui.card({ sections: [v.userTitle(who), lines.length ? lines.join("\n") : v.none] }));
    }

    if (sub === "block") {
      // moderators can't be blocked from reporting (they'd lose a way to raise staff problems)
      const member = interaction.options.getMember("member");
      const settings = await settingsStore.get(guildId);
      const level = member ? permissions.levelOf({
        user: { id: user.id }, inGuild: () => true, member,
        memberPermissions: member.permissions
      }, { moderatorRoleIds: settings.moderatorRoleIds }) : "everyone";
      if (permissions.atLeast(level, "moderator")) throw refused(v.cantBlockStaff);
      const added = await limits.block(guildId, user.id, interaction.user.id, interaction.options.getString("reason"));
      await settingsStore.audit(guildId, interaction.user.id, "reports.block", { userId: user.id });
      return ui.reply(interaction, ui.card({ accent: "success", sections: [added ? v.blocked(who) : v.alreadyBlocked(who)] }));
    }

    const removed = await limits.unblock(guildId, user.id);
    if (removed) await settingsStore.audit(guildId, interaction.user.id, "reports.unblock", { userId: user.id });
    return ui.reply(interaction, ui.card({ accent: "success", sections: [removed ? v.unblocked(who) : v.notBlocked(who)] }));
  }
};
