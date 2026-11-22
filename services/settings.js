/**
 * A server's settings: the tp_guilds row, its moderator and staff roles and its reasons, read as one
 * object, and changed by /setup with every change written to the audit log.
 */

const sqlStore = require("./sqlStore");
const t = require("../strings/en");

const LIMITS = {
  reporter_cooldown_minutes: [0, 30],
  max_open_reports: [1, 20],
  urgent_cooldown_minutes: [0, 60],
  retention_days: [30, 365]
};
const MAX_REASONS = 9;
const MAX_REASON_LENGTH = 80;
const MAX_ROLES = 10;

const ids = value => (value === null || value === undefined ? null : String(value));

/** The settings object every part of Tipoff reads. Missing row = defaults (Tipoff not set up yet). */
function shape(row, roles = [], reasons = []) {
  const r = row || {};
  const own = reasons.sort((a, b) => a.position - b.position).map(x => x.label);
  return {
    guildId: ids(r.guild_id),
    exists: Boolean(row),
    reportChannelId: ids(r.report_channel_id),
    userReportChannelId: ids(r.user_report_channel_id),
    escalationChannelId: ids(r.escalation_channel_id),
    urgentRoleId: ids(r.urgent_role_id),
    anonymous: Boolean(Number(r.anonymous_enabled || 0)),
    reporterCooldownMinutes: Number(r.reporter_cooldown_minutes ?? 2),
    maxOpenReports: Number(r.max_open_reports ?? 5),
    urgentCooldownMinutes: Number(r.urgent_cooldown_minutes ?? 10),
    outcomeDms: Boolean(Number(r.outcome_dms || 0)),
    closeForumPosts: r.close_forum_posts === undefined ? true : Boolean(Number(r.close_forum_posts)),
    retentionDays: Number(r.retention_days ?? 90),
    moderatorRoleIds: roles.filter(x => x.kind === "moderator").map(x => String(x.role_id)),
    staffRoleIds: roles.filter(x => x.kind === "staff").map(x => String(x.role_id)),
    customReasons: own,
    reasons: [...(own.length ? own : t.defaultReasons), t.otherReason]
  };
}

async function get(guildId, { query = sqlStore.query } = {}) {
  const [rows, roles, reasons] = await Promise.all([
    query("SELECT * FROM tp_guilds WHERE guild_id = ?", [guildId]),
    query("SELECT role_id, kind FROM tp_guild_roles WHERE guild_id = ?", [guildId]),
    query("SELECT position, label FROM tp_guild_reasons WHERE guild_id = ?", [guildId])
  ]);
  return shape(rows[0], roles, reasons);
}

async function audit(guildId, actorId, action, detail, { query = sqlStore.query, now = new Date() } = {}) {
  await query("INSERT INTO tp_audit (guild_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    [guildId, actorId, action, detail === undefined ? null : JSON.stringify(detail), now]);
}

async function ensureRow(guildId, query = sqlStore.query, now = new Date()) {
  await query("INSERT INTO tp_guilds (guild_id, joined_at, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE guild_id = guild_id", [guildId, now, now]);
}

/** /setup channels. channels: { report, user, escalation, urgentRole } (IDs or null), anonymous: boolean. */
async function saveChannels(guildId, actorId, { report, user, escalation, urgentRole, anonymous }, { query = sqlStore.query, now = new Date() } = {}) {
  await ensureRow(guildId, query, now);
  await query(
    `UPDATE tp_guilds SET report_channel_id = ?, user_report_channel_id = ?, escalation_channel_id = ?, urgent_role_id = ?,
      anonymous_enabled = ?, updated_at = ? WHERE guild_id = ?`,
    [report || null, user || null, escalation || null, urgentRole || null, anonymous ? 1 : 0, now, guildId]
  );
  await audit(guildId, actorId, "setup.channels", { report, user, escalation, urgentRole, anonymous }, { query, now });
}

/** /setup roles. */
async function saveRoles(guildId, actorId, { moderators = [], staff = [] }, { transaction = sqlStore.transaction, now = new Date() } = {}) {
  const mods = [...new Set(moderators.map(String))].slice(0, MAX_ROLES);
  const staffRoles = [...new Set(staff.map(String))].slice(0, MAX_ROLES);
  await transaction(async connection => {
    const q = (sql, params) => connection.query(sql, params);
    await q("INSERT INTO tp_guilds (guild_id, joined_at, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)", [guildId, now, now]);
    await q("DELETE FROM tp_guild_roles WHERE guild_id = ?", [guildId]);
    for (const id of mods) await q("INSERT INTO tp_guild_roles (guild_id, role_id, kind) VALUES (?, ?, 'moderator')", [guildId, id]);
    for (const id of staffRoles) await q("INSERT INTO tp_guild_roles (guild_id, role_id, kind) VALUES (?, ?, 'staff')", [guildId, id]);
    await q("INSERT INTO tp_audit (guild_id, actor_id, action, detail, created_at) VALUES (?, ?, 'setup.roles', ?, ?)",
      [guildId, actorId, JSON.stringify({ moderators: mods, staff: staffRoles }), now]);
  });
}

/**
 * Turns the reasons box into a list, or throws a { userMessage } error. An empty box means "use the defaults".
 * "Other" is always added by Tipoff, so a line saying "Other" is dropped.
 */
function parseReasons(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim().replace(/\s+/g, " ")).filter(Boolean)
    .filter(line => line.toLowerCase() !== t.otherReason.toLowerCase());
  // the first spelling of each reason wins ("Spam" then "spam" keeps "Spam")
  const seen = new Set();
  const unique = lines.filter(line => !seen.has(line.toLowerCase()) && seen.add(line.toLowerCase()));
  if (unique.length > MAX_REASONS) throw Object.assign(new Error("too many reasons"), { userMessage: t.setup.tooManyReasons });
  if (unique.some(line => line.length > MAX_REASON_LENGTH)) throw Object.assign(new Error("reason too long"), { userMessage: t.setup.reasonTooLong });
  return unique;
}

async function saveReasons(guildId, actorId, reasons, { transaction = sqlStore.transaction, now = new Date() } = {}) {
  await transaction(async connection => {
    const q = (sql, params) => connection.query(sql, params);
    await q("INSERT INTO tp_guilds (guild_id, joined_at, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)", [guildId, now, now]);
    await q("DELETE FROM tp_guild_reasons WHERE guild_id = ?", [guildId]);
    for (const [index, label] of reasons.entries()) await q("INSERT INTO tp_guild_reasons (guild_id, position, label) VALUES (?, ?, ?)", [guildId, index, label]);
    await q("INSERT INTO tp_audit (guild_id, actor_id, action, detail, created_at) VALUES (?, ?, 'setup.reasons', ?, ?)",
      [guildId, actorId, JSON.stringify(reasons), now]);
  });
}

/** Checks a number from the limits form, or throws a { userMessage } error. */
function parseLimit(column, raw, label) {
  const [min, max] = LIMITS[column];
  const text = String(raw ?? "").trim();
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < min || value > max) {
    throw Object.assign(new Error(`bad ${column}`), { userMessage: t.setup.invalidNumber(label, min, max) });
  }
  return value;
}

/** /setup limits. values: { reporterCooldown, maxOpen, urgentCooldown, retention, outcomeDms, closePosts } (checked). */
async function saveLimits(guildId, actorId, v, { query = sqlStore.query, now = new Date() } = {}) {
  await ensureRow(guildId, query, now);
  await query(
    `UPDATE tp_guilds SET reporter_cooldown_minutes = ?, max_open_reports = ?, urgent_cooldown_minutes = ?, retention_days = ?,
      outcome_dms = ?, close_forum_posts = ?, updated_at = ? WHERE guild_id = ?`,
    [v.reporterCooldown, v.maxOpen, v.urgentCooldown, v.retention, v.outcomeDms ? 1 : 0, v.closePosts ? 1 : 0, now, guildId]
  );
  await audit(guildId, actorId, "setup.limits", v, { query, now });
}

module.exports = { LIMITS, MAX_REASONS, MAX_ROLES, shape, get, audit, saveChannels, saveRoles, parseReasons, saveReasons, parseLimit, saveLimits };
