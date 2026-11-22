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

function refusalText(check) {
  const r = t.report.refused;
  if (check.reason === "blocked") return r.blocked;
  if (check.reason === "cooldown") return r.cooldown(check.minutes);
  if (check.reason === "tooManyOpen") return r.tooManyOpen(check.open);
  return r[check.reason] || t.errors.notAllowed;
}

/** The report form (at most 5 parts). kind: message | user | general. */
function buildForm(kind, settings, { customId, preview = null } = {}) {
  const tr = t.report;
  const reasons = m.label(tr.reason, tr.reasonHint, m.radio("reason", settings.reasons.map(label => ({ value: label, label }))));
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

function previewOf(snapshot) {
  const ts = value => (value ? `<t:${Math.floor(value / 1000)}:R>` : "?");
  if (snapshot.kind === "message") {
    const author = snapshot.author.kind === "webhook" ? `**${String(snapshot.author.webhookName || "webhook").replace(/[*_`~|<>@]/g, "")}**` : `<@${snapshot.author.userId}>`;
    const body = snapshot.content ? evidence.quote(evidence.defang(snapshot.content.slice(0, 600))) : t.report.previewNoText;
    const files = snapshot.attachments.length ? `\n${t.report.previewAttachments(snapshot.attachments.length)}` : "";
    return `${t.report.previewMessage(author, ts(snapshot.createdAt))}\n${body}${files}`;
  }
  return t.report.previewUser(`<@${snapshot.userId}>`, ts(snapshot.createdAt), snapshot.joinedAt ? ts(snapshot.joinedAt) : null);
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
  const settings = await settingsStore.get(guildId);
  if (!settings.reportChannelId) throw new Refusal(t.report.refused.notSetUp);
  const check = await limits.canReport(guildId, interaction.user.id, settings);
  if (!check.ok) throw new Refusal(refusalText(check));

  if (kind === "general") return interaction.showModal(buildForm("general", settings, { customId: "report:g" }));

  const botId = interaction.client.user.id;
  const result = kind === "message"
    ? evidence.fromMessage(interaction.targetMessage, {
      reporterId: interaction.user.id, botId, channelName: interaction.channel?.name || null, uploadLimit: interaction.attachmentSizeLimit
    })
    : evidence.fromUser(interaction.targetUser, interaction.targetMember, { reporterId: interaction.user.id, botId });
  if (result.refused) throw new Refusal(t.report.refused[result.refused]);

  const draftId = await saveDraft(guildId, interaction.user.id, kind, result.snapshot);
  return interaction.showModal(buildForm(kind, settings, { customId: `report:${draftId}`, preview: previewOf(result.snapshot) }));
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
  const settings = await settingsStore.get(guildId);
  if (!settings.reportChannelId) throw new Refusal(t.report.refused.notSetUp);

  const values = m.reader(interaction);
  let kind;
  let snapshot;
  if (draftId === "g") {
    kind = "general";
    const details = values.text("details");
    if (!details) throw new Refusal(t.report.refused.empty);
    snapshot = evidence.fromGeneral(details, values.files("screenshots"), { uploadLimit: interaction.attachmentSizeLimit });
  } else {
    const draft = await takeDraft(draftId, guildId, userId);
    if (!draft) throw new Refusal(t.report.refused.expired);
    kind = draft.kind;
    snapshot = draft.snapshot;
  }

  // checked again: the limits may have changed while the form was open
  const check = await limits.canReport(guildId, userId, settings);
  if (!check.ok) throw new Refusal(refusalText(check));

  const picked = values.radio("reason");
  const reason = settings.reasons.includes(picked) ? picked : t.otherReason;
  const chosen = values.checked("options");
  const urgent = Boolean(settings.urgentRoleId) && chosen.includes("urgent");
  const anonymous = settings.anonymous && chosen.includes("anonymous");
  const note = kind === "general" ? null : (values.text("note").slice(0, NOTE_MAX) || null);

  const targetUserId = kind === "message" ? snapshot.author.userId : kind === "user" ? snapshot.userId : null;
  const escalated = await isStaff(interaction.guild, targetUserId, settings);

  const saved = await cases.submit({
    guildId, kind, reason, snapshot, reporterId: userId, anonymous, urgent, note, escalated,
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

  const lines = [t.report.sent(saved.number, settings.outcomeDms)];
  if (anonymous) lines.push(t.report.sentAnonymous);
  if (urgent && saved.becameUrgent && !ping) lines.push(t.report.urgentCoolingDown);
  if (!result.delivered) lines.push(t.report.notDelivered);
  return ui.reply(interaction, ui.card({ accent: "success", sections: [lines.join("\n")] }));
}

async function pruneDrafts({ query = sqlStore.query, now = new Date() } = {}) {
  const result = await query("DELETE FROM tp_report_drafts WHERE created_at < ?", [new Date(now.getTime() - DRAFT_MAX_AGE_MS)]);
  return Number(result?.affectedRows || 0);
}

module.exports = { Refusal, refusalText, buildForm, previewOf, saveDraft, takeDraft, openForm, isStaff, submit, pruneDrafts, DRAFT_MAX_AGE_MS };
