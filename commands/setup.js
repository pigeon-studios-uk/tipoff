const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ApplicationIntegrationType, ChannelType, MessageFlags } = require("discord.js");
const settingsStore = require("../services/settings");
const setupCheck = require("../services/setupCheck");
const delivery = require("../services/delivery");
const m = require("../services/modals");
const ui = require("../services/ui");
const t = require("../strings/en");

const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread,
  ChannelType.AnnouncementThread, ChannelType.GuildForum, ChannelType.GuildMedia];

/**
 * Every form shows what's saved now, so changing one thing never quietly changes another (if the anonymous box
 * always started unticked, saving anything else would turn anonymous reports off).
 */
const forms = {
  channels: s => m.modal("setup:channels", t.setup.channelsTitle, [
    m.label(t.setup.reportChannel, t.setup.reportChannelHint, m.channelSelect("report", { required: true, current: s.reportChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.userChannel, t.setup.userChannelHint, m.channelSelect("user", { current: s.userReportChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.escalationChannel, t.setup.escalationChannelHint, m.channelSelect("escalation", { current: s.escalationChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.urgentRole, t.setup.urgentRoleHint, m.roleSelect("urgent", { max: 1, current: s.urgentRoleId ? [s.urgentRoleId] : [] })),
    m.label(t.setup.options, null, m.checkboxes("options", [{ value: "anonymous", label: t.setup.anonymous, description: t.setup.anonymousHint, default: s.anonymous }]))
  ]),
  roles: s => m.modal("setup:roles", t.setup.rolesTitle, [
    m.label(t.setup.moderatorRoles, t.setup.moderatorRolesHint, m.roleSelect("moderators", { max: settingsStore.MAX_ROLES, current: s.moderatorRoleIds })),
    m.label(t.setup.staffRoles, t.setup.staffRolesHint, m.roleSelect("staff", { max: settingsStore.MAX_ROLES, current: s.staffRoleIds }))
  ]),
  reasons: s => m.modal("setup:reasons", t.setup.reasonsTitle, [
    m.label(t.setup.reasons, t.setup.reasonsHint, m.textInput("reasons", { required: false, max: 1000, value: (s.customReasons.length ? s.customReasons : t.defaultReasons).join("\n") }))
  ]),
  limits: s => m.modal("setup:limits", t.setup.limitsTitle, [
    m.label(t.setup.reporterCooldown, null, m.textInput("reporterCooldown", { style: m.TEXT.Short, required: true, max: 3, value: String(s.reporterCooldownMinutes) })),
    m.label(t.setup.maxOpen, null, m.textInput("maxOpen", { style: m.TEXT.Short, required: true, max: 3, value: String(s.maxOpenReports) })),
    m.label(t.setup.urgentCooldown, null, m.textInput("urgentCooldown", { style: m.TEXT.Short, required: true, max: 3, value: String(s.urgentCooldownMinutes) })),
    m.label(t.setup.retention, null, m.textInput("retention", { style: m.TEXT.Short, required: true, max: 3, value: String(s.retentionDays) })),
    m.label(t.setup.limitOptions, null, m.checkboxes("options", [
      { value: "outcomeDms", label: t.setup.outcomeDms, description: t.setup.outcomeDmsHint, default: s.outcomeDms },
      { value: "closePosts", label: t.setup.closePosts, default: s.closeForumPosts }
    ]))
  ])
};

/** /setup check, and the reply after saving: the settings, any problems, and waiting reports posted. */
async function checkReply(interaction, settings, { heading = t.setup.checkTitle } = {}) {
  const problems = await setupCheck.run(interaction.guild, settings);
  const sections = [heading, setupCheck.summary(settings), "---"];
  if (problems.length) {
    sections.push(`${t.setup.checkProblems}\n${problems.map(p => `• ${p}`).join("\n")}`);
  } else {
    sections.push(t.setup.checkOk);
    const { posted, waiting } = await delivery.redeliver(interaction.client, interaction.guildId);
    if (posted) sections.push(t.setup.redelivered(posted));
    if (waiting) sections.push(t.setup.stillWaiting(waiting));
  }
  return ui.card({ accent: problems.length ? "warning" : "success", sections });
}

module.exports = {
  level: "manage_server",
  forms,
  checkReply,
  CHANNEL_TYPES,

  data: new SlashCommandBuilder()
    .setName(t.commands.setup.name)
    .setDescription(t.commands.setup.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub => sub.setName("channels").setDescription(t.commands.setup.channels))
    .addSubcommand(sub => sub.setName("roles").setDescription(t.commands.setup.roles))
    .addSubcommand(sub => sub.setName("reasons").setDescription(t.commands.setup.reasons))
    .addSubcommand(sub => sub.setName("limits").setDescription(t.commands.setup.limits))
    .addSubcommand(sub => sub.setName("check").setDescription(t.commands.setup.check)),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsStore.get(interaction.guildId);
    if (forms[sub]) return interaction.showModal(forms[sub](settings));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return ui.reply(interaction, await checkReply(interaction, settings));
  }
};
