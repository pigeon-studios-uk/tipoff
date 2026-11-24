const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ApplicationIntegrationType, ChannelType, MessageFlags } = require("discord.js");
const settingsStore = require("../services/settings");
const setupCheck = require("../services/setupCheck");
const delivery = require("../services/delivery");
const m = require("../services/modals");
const ui = require("../services/ui");
const strings = require("../strings");
const en = require("../strings/en");
const { describe } = require("../utility/localize");

const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread,
  ChannelType.AnnouncementThread, ChannelType.GuildForum, ChannelType.GuildMedia];

/**
 * Every form shows what's saved now, so changing one thing never quietly changes another (if the anonymous box
 * always started unticked, saving anything else would turn anonymous reports off). Forms are in the language of whoever
 * opened them (t); the reasons box shows the default reasons in the server's language (server), since that's what cases
 * are saved under.
 */
const forms = {
  channels: (s, { t = en } = {}) => m.modal("setup:channels", t.setup.channelsTitle, [
    m.label(t.setup.reportChannel, t.setup.reportChannelHint, m.channelSelect("report", { required: true, current: s.reportChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.userChannel, t.setup.userChannelHint, m.channelSelect("user", { current: s.userReportChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.escalationChannel, t.setup.escalationChannelHint, m.channelSelect("escalation", { current: s.escalationChannelId, types: CHANNEL_TYPES })),
    m.label(t.setup.urgentRole, t.setup.urgentRoleHint, m.roleSelect("urgent", { max: 1, current: s.urgentRoleId ? [s.urgentRoleId] : [] })),
    m.label(t.setup.options, null, m.checkboxes("options", [{ value: "anonymous", label: t.setup.anonymous, description: t.setup.anonymousHint, default: s.anonymous }]))
  ]),
  roles: (s, { t = en } = {}) => m.modal("setup:roles", t.setup.rolesTitle, [
    m.label(t.setup.moderatorRoles, t.setup.moderatorRolesHint, m.roleSelect("moderators", { max: settingsStore.MAX_ROLES, current: s.moderatorRoleIds })),
    m.label(t.setup.staffRoles, t.setup.staffRolesHint, m.roleSelect("staff", { max: settingsStore.MAX_ROLES, current: s.staffRoleIds }))
  ]),
  reasons: (s, { t = en, server = en } = {}) => m.modal("setup:reasons", t.setup.reasonsTitle, [
    m.label(t.setup.reasons, t.setup.reasonsHint, m.textInput("reasons", { required: false, max: 1000, value: (s.customReasons.length ? s.customReasons : server.defaultReasons).join("\n") }))
  ]),
  limits: (s, { t = en } = {}) => m.modal("setup:limits", t.setup.limitsTitle, [
    m.label(t.setup.reporterCooldown, t.setup.reporterCooldownHint, m.textInput("reporterCooldown", { style: m.TEXT.Short, required: true, max: 3, value: String(s.reporterCooldownMinutes) })),
    m.label(t.setup.maxOpen, null, m.textInput("maxOpen", { style: m.TEXT.Short, required: true, max: 3, value: String(s.maxOpenReports) })),
    m.label(t.setup.urgentCooldown, t.setup.urgentCooldownHint, m.textInput("urgentCooldown", { style: m.TEXT.Short, required: true, max: 3, value: String(s.urgentCooldownMinutes) })),
    m.label(t.setup.retention, null, m.textInput("retention", { style: m.TEXT.Short, required: true, max: 3, value: String(s.retentionDays) })),
    m.label(t.setup.limitOptions, null, m.checkboxes("options", [
      { value: "outcomeDms", label: t.setup.outcomeDms, description: t.setup.outcomeDmsHint, default: s.outcomeDms },
      { value: "closePosts", label: t.setup.closePosts, default: s.closeForumPosts }
    ]))
  ]),
  // "auto" = the server's own Discord language (stored as no choice); then one option per language file
  language: (s, { t = en, guild = null } = {}) => m.modal("setup:language", t.setup.languageTitle, [
    m.label(t.setup.language, t.setup.languageHint, m.stringSelect("language", [
      { value: "auto", label: t.setup.languageAuto(strings.t(guild?.preferredLocale).language.name), default: !s.language || !strings.supported(s.language) },
      ...strings.languages().map(lang => ({
        value: lang.locales[0], label: lang.name,
        ...(lang.status === "reviewed" ? {} : { description: t.setup.languageUnreviewed }),
        default: Boolean(s.language) && strings.supported(s.language) && strings.codeFor(s.language) === lang.code
      }))
    ]))
  ])
};

/** /setup check, and the reply after saving: the settings, any problems, and waiting reports posted. */
async function checkReply(interaction, settings, { heading } = {}) {
  const t = strings.forUser(interaction);
  const problems = await setupCheck.run(interaction.guild, settings, { strings: t });
  const sections = [heading || t.setup.checkTitle, setupCheck.summary(settings, { strings: t, guild: interaction.guild }), "---"];
  if (problems.length) {
    sections.push(`${t.setup.checkProblems}\n${problems.map(p => `• ${p}`).join("\n")}`);
  } else {
    sections.push(t.setup.checkOk);
    const { posted, waiting } = await delivery.redeliver(interaction.client, interaction.guildId);
    if (posted) sections.push(t.setup.redelivered(posted));
    if (waiting) sections.push(t.setup.stillWaiting(waiting));
  }
  sections.push(ui.unreviewed(t));
  return ui.card({ accent: problems.length ? "warning" : "success", sections });
}

module.exports = {
  level: "manage_server",
  forms,
  checkReply,
  CHANNEL_TYPES,

  data: describe(new SlashCommandBuilder().setName(en.commands.setup.name), s => s.commands.setup.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub => describe(sub.setName("channels"), s => s.commands.setup.channels))
    .addSubcommand(sub => describe(sub.setName("roles"), s => s.commands.setup.roles))
    .addSubcommand(sub => describe(sub.setName("reasons"), s => s.commands.setup.reasons))
    .addSubcommand(sub => describe(sub.setName("limits"), s => s.commands.setup.limits))
    .addSubcommand(sub => describe(sub.setName("language"), s => s.commands.setup.language))
    .addSubcommand(sub => describe(sub.setName("check"), s => s.commands.setup.check)),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await settingsStore.get(interaction.guildId);
    const t = strings.forUser(interaction);
    if (forms[sub]) return interaction.showModal(forms[sub](settings, { t, server: strings.forServer(settings, interaction.guild), guild: interaction.guild }));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return ui.reply(interaction, await checkReply(interaction, settings));
  }
};
