/**
 * Abuse limits: blocked reporters, the per-member cool-down, the most open reports per member, and the
 * per-server cool-down on urgent pings. Without them, anyone could spam reports and ping the mod role
 * as often as they liked, anonymously.
 *
 * Anonymous reports count like any other: Tipoff keeps who sent them for exactly this.
 */

const sqlStore = require("./sqlStore");

/**
 * Whether this member may send a report now: { ok: true } or { ok: false, reason, minutes?, open? }.
 * A report that only joins an open case still counts towards the cool-down, but never towards "too many open"
 * if it's a case they already reported.
 */
async function canReport(guildId, userId, settings, { query = sqlStore.query, now = new Date() } = {}) {
  const [blocked] = await query("SELECT 1 AS b FROM tp_blocks WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  if (blocked) return { ok: false, reason: "blocked" };

  if (settings.reporterCooldownMinutes > 0) {
    const [row] = await query("SELECT last_report_at FROM tp_limits WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    if (row?.last_report_at) {
      const waitMs = new Date(row.last_report_at).getTime() + settings.reporterCooldownMinutes * 60000 - now.getTime();
      if (waitMs > 0) return { ok: false, reason: "cooldown", minutes: Math.max(1, Math.ceil(waitMs / 60000)) };
    }
  }

  const [count] = await query(
    `SELECT COUNT(DISTINCT c.id) AS n FROM tp_case_reports r JOIN tp_cases c ON c.id = r.case_id
     WHERE c.guild_id = ? AND r.reporter_id = ? AND c.status IN ('open','claimed')`,
    [guildId, userId]
  );
  if (Number(count?.n || 0) >= settings.maxOpenReports) return { ok: false, reason: "tooManyOpen", open: Number(count.n) };
  return { ok: true };
}

async function noteReport(guildId, userId, { query = sqlStore.query, now = new Date() } = {}) {
  await query(
    `INSERT INTO tp_limits (guild_id, user_id, last_report_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_report_at = VALUES(last_report_at)`,
    [guildId, userId, now]
  );
}

/**
 * Whether an urgent report may ping the urgent role now (one ping per server per cool-down). If it may, the ping is
 * recorded straight away, so two urgent reports at once can't both ping. Uses the server's own row in tp_limits
 * (user_id 0).
 */
async function takeUrgentPing(guildId, settings, { query = sqlStore.query, now = new Date() } = {}) {
  if (!settings.urgentRoleId) return false;
  const cutoff = new Date(now.getTime() - settings.urgentCooldownMinutes * 60000);
  await query("INSERT IGNORE INTO tp_limits (guild_id, user_id, last_urgent_at) VALUES (?, 0, NULL)", [guildId]);
  const result = await query(
    "UPDATE tp_limits SET last_urgent_at = ? WHERE guild_id = ? AND user_id = 0 AND (last_urgent_at IS NULL OR last_urgent_at <= ?)",
    [now, guildId, cutoff]
  );
  return Number(result?.affectedRows || 0) === 1;
}

async function block(guildId, userId, actorId, reason, { query = sqlStore.query, now = new Date() } = {}) {
  const result = await query(
    "INSERT IGNORE INTO tp_blocks (guild_id, user_id, blocked_by, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    [guildId, userId, actorId, reason || null, now]
  );
  return Number(result?.affectedRows || 0) === 1;
}

async function unblock(guildId, userId, { query = sqlStore.query } = {}) {
  const result = await query("DELETE FROM tp_blocks WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return Number(result?.affectedRows || 0) === 1;
}

module.exports = { canReport, noteReport, takeUrgentPing, block, unblock };
