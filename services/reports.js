/**
 * The three ways to report: Report Message, Report User and /report.
 *
 *   openForm(interaction, kind)   checks the reporter may report, takes the snapshot, and shows the form
 *   submit(interaction, args)     turns the sent form into a case (new or joined), posts or updates the card, and
 *                                 tells the reporter "Report #142 sent"
 *
 * Discord doesn't send the message back with the form, so the snapshot is kept as a draft while the form is open
 * (tp_report_drafts, deleted when sent, pruned after 30 minutes). A form can stay open for Discord's full 15 minutes
 * without being lost.
 */

const crypto = require("node:crypto");
const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const logger = require("./logger");
const sqlStore = require("./sqlStore");
const settingsStore = require("./settings");
const limits = require("./limits");
const evidence = require("./evidence");
const cases = require("./cases");
const delivery = require("./delivery");
const m = require("./modals");
const ui = require("./ui");
const strings = require("../strings");
const t = require("../strings/en");

const DRAFT_MAX_AGE_MS = 30 * 60 * 1000;
const NOTE_MAX = 1000;
const DETAILS_MAX = 2000;

class Refusal extends Error {
  constructor(userMessage) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

function refusalText(check, s = t) {
  const r = s.report.refused;
  if (check.reason === "blocked") return r.blocked;
  if (check.reason === "cooldown") return r.cooldown(check.minutes);
  if (check.reason === "tooManyOpen") return r.tooManyOpen(check.open);
  return r[check.reason] || s.errors.notAllowed;
}

/**
 * The report form (at most 5 parts). kind: message | user | general. The form is in the reporter's language (strings);
 * each reason's value is the same reason in the server's language (server), which is what the case is saved under.
 */
function buildForm(kind, settings, { customId, preview = null, strings: s = t, server = t } = {}) {
  const tr = s.report;
  const saved = settingsStore.reasonsFor(settings, server);
  const shown = settingsStore.reasonsFor(settings, s);
  const reasons = m.label(tr.reason, tr.reasonHint, m.radio("reason", saved.map((value, i) => ({ value, label: shown[i] }))));
  const options = [];
  if (settings.urgentRoleId) options.push({ value: "urgent", label: tr.urgent, description: tr.urgentHint });
  if (settings.anonymous) options.push({ value: "anonymous", label: tr.anonymous, description: tr.anonymousHint });
  const optionsPart = options.length ? m.label(tr.options, null, m.checkboxes("options", options)) : null;
  const footer = m.textDisplay(tr.discordSafety(config.links.discordSafety));

  if (kind === "general") {
    return m.modal(customId, tr.titles.general, [
      reasons,
      m.label(tr.details, tr.detailsHint, m.textInput("details", { required: true, max: DETAILS_MAX, min: 10 })),
      m.label(tr.screenshots, tr.screenshotsHint, m.fileUpload("screenshots", { max: 5 })),
      optionsPart,
      // the footer is dropped if the form is full (Discord allows 5 parts)
      optionsPart ? null : footer
    ]);
  }
  const note = kind === "user"
    ? m.label(tr.whatHappened, tr.whatHappenedHint, m.textInput("note", { required: true, max: NOTE_MAX, min: 5 }))
    : m.label(tr.note, tr.noteHint, m.textInput("note", { required: false, max: NOTE_MAX, placeholder: tr.noteFor.message }));
  return m.modal(customId, tr.titles[kind], [preview ? m.textDisplay(preview) : null, reasons, note, optionsPart, footer]);
}

function previewOf(snapshot, s = t) {
  const ts = value => (value ? `<t:${Math.floor(value / 1000)}:R>` : "?");
  if (snapshot.kind === "message") {
    const author = snapshot.author.kind === "webhook" ? `**${String(snapshot.author.webhookName || "webhook").replace(/[*_`~|<>@]/g, "")}**` : `<@${snapshot.author.userId}>`;
    const body = snapshot.content ? evidence.quote(evidence.defang(snapshot.content.slice(0, 600))) : s.report.previewNoText;
    const files = snapshot.attachments.length ? `\n${s.report.previewAttachments(snapshot.attachments.length)}` : "";
    return `${s.report.previewMessage(author, ts(snapshot.createdAt))}\n${body}${files}`;
  }
  return s.report.previewUser(`<@${snapshot.userId}>`, ts(snapshot.createdAt), snapshot.joinedAt ? ts(snapshot.joinedAt) : null);
}

async function saveDraft(guildId, userId, kind, snapshot, { query = sqlStore.query, now = new Date() } = {}) {
  const id = crypto.randomBytes(8).toString("hex");
  await query("INSERT INTO tp_report_drafts (id, guild_id, user_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, guildId, userId, kind, JSON.stringify(snapshot), now]);
  return id;
}

/** Takes a draft (and deletes it). Only the person who opened the form can use it, in the same server. */
async function takeDraft(id, guildId, userId, { query = sqlStore.query, now = new Date() } = {}) {
  if (!/^[0-9a-f]{16}$/.test(String(id))) return null;
  const [row] = await query("SELECT * FROM tp_report_drafts WHERE id = ?", [id]);
  if (!row || String(row.guild_id) !== String(guildId) || String(row.user_id) !== String(userId)) return null;
  await query("DELETE FROM tp_report_drafts WHERE id = ?", [id]);
  if (now.getTime() - new Date(row.created_at).getTime() > DRAFT_MAX_AGE_MS) return null;
  try {
    return { kind: row.kind, snapshot: JSON.parse(row.data) };
  } catch {
    return null;
  }
}

/** Shows the right form, or refuses with a clear message (never saves anything when refusing). */
async function openForm(interaction, kind) {
  const guildId = interaction.guildId;
  const s = strings.forUser(interaction);
  const settings = await settingsStore.get(guildId);
  if (!settings.reportChannelId) throw new Refusal(s.report.refused.notSetUp);
  const check = await limits.canReport(guildId, interaction.user.id, settings);
  if (!check.ok) throw new Refusal(refusalText(check, s));
  const server = strings.forServer(settings, interaction.guild);

  if (kind === "general") return interaction.showModal(buildForm("general", settings, { customId: "report:g", strings: s, server }));

  const botId = interaction.client.user.id;
  const result = kind === "message"
    ? evidence.fromMessage(interaction.targetMessage, {
      reporterId: interaction.user.id, botId, channelName: interaction.channel?.name || null, uploadLimit: interaction.attachmentSizeLimit
    })
    : evidence.fromUser(interaction.targetUser, interaction.targetMember, { reporterId: interaction.user.id, botId });
  if (result.refused) throw new Refusal(s.report.refused[result.refused]);

  const draftId = await saveDraft(guildId, interaction.user.id, kind, result.snapshot);
  return interaction.showModal(buildForm(kind, settings, { customId: `report:${draftId}`, preview: previewOf(result.snapshot, s), strings: s, server }));
}

/**
 * Whether a case's target is staff: one of the server's staff roles, or Manage Server / Administrator.
 * Reports about admins aren't refused: they go to the escalation channel instead.
 */
async function isStaff(guild, userId, settings) {
  if (!guild || !userId) return false;
  if (String(guild.ownerId) === String(userId)) return true;
  try {
    const member = await guild.members.fetch(String(userId));
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    return settings.staffRoleIds.some(id => member.roles.cache.has(id));
  } catch {
    return false; // not in the server any more
  }
}

/** Handles a sent report form. args: [draftId] or ["g"]. */
async function submit(interaction, [draftId]) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const s = strings.forUser(interaction);
  const settings = await settingsStore.get(guildId);
  if (!settings.reportChannelId) throw new Refusal(s.report.refused.notSetUp);
  const server = strings.forServer(settings, interaction.guild);

  const values = m.reader(interaction);
  let kind;
  let snapshot;
  if (draftId === "g") {
    kind = "general";
    const details = values.text("details");
    if (!details) throw new Refusal(s.report.refused.empty);
    snapshot = evidence.fromGeneral(details, values.files("screenshots"), { uploadLimit: interaction.attachmentSizeLimit });
  } else {
    const draft = await takeDraft(draftId, guildId, userId);
    if (!draft) throw new Refusal(s.report.refused.expired);
    kind = draft.kind;
    snapshot = draft.snapshot;
  }

  // checked again: the limits may have changed while the form was open
  const check = await limits.canReport(guildId, userId, settings);
  if (!check.ok) throw new Refusal(refusalText(check, s));

  const picked = values.radio("reason");
  const reason = settingsStore.reasonsFor(settings, server).includes(picked) ? picked : server.otherReason;
  const chosen = values.checked("options");
  const urgent = Boolean(settings.urgentRoleId) && chosen.includes("urgent");
  const anonymous = settings.anonymous && chosen.includes("anonymous");
  const note = kind === "general" ? null : (values.text("note").slice(0, NOTE_MAX) || null);

  const targetUserId = kind === "message" ? snapshot.author.userId : kind === "user" ? snapshot.userId : null;
  const escalated = await isStaff(interaction.guild, targetUserId, settings);

  const saved = await cases.submit({
    guildId, kind, reason, snapshot, reporterId: userId, anonymous, urgent, note, escalated,
    // the reporter's language, for the outcome DM
    locale: interaction.locale || null,
    targetUserId,
    targetChannelId: kind === "message" ? snapshot.channelId : null,
    targetMessageId: kind === "message" ? snapshot.messageId : null,
    editStamp: kind === "message" ? evidence.editStamp(snapshot) : 0
  });
  await limits.noteReport(guildId, userId);

  // the urgent role is pinged at most once per cool-down per server, and only by a report that made the case urgent
  const ping = urgent && saved.becameUrgent ? await limits.takeUrgentPing(guildId, settings) : false;
  let result;
  try {
    result = await delivery.deliver(interaction.client, saved.caseId, { ping: ping && !saved.joined });
    if (ping && saved.joined && result.delivered) await delivery.pingUrgent(interaction.client, saved.caseId);
  } catch (err) {
    logger.error(`Couldn't post case ${saved.caseId} in server ${guildId}: ${err.stack || err}`);
    result = { delivered: false };
  }

  const lines = [s.report.sent(saved.number, settings.outcomeDms)];
  if (anonymous) lines.push(s.report.sentAnonymous);
  if (urgent && saved.becameUrgent && !ping) lines.push(s.report.urgentCoolingDown);
  if (!result.delivered) lines.push(s.report.notDelivered);
  const notice = ui.unreviewed(s);
  if (notice) lines.push(notice);
  return ui.reply(interaction, ui.card({ accent: "success", sections: [lines.join("\n")] }));
}

async function pruneDrafts({ query = sqlStore.query, now = new Date() } = {}) {
  const result = await query("DELETE FROM tp_report_drafts WHERE created_at < ?", [new Date(now.getTime() - DRAFT_MAX_AGE_MS)]);
  return Number(result?.affectedRows || 0);
}

module.exports = { Refusal, refusalText, buildForm, previewOf, saveDraft, takeDraft, openForm, isStaff, submit, pruneDrafts, DRAFT_MAX_AGE_MS };
