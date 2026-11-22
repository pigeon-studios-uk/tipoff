/** /reports stats and /reports user, and the counts for /privacy. */

const sqlStore = require("./sqlStore");

function duration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return null;
  const s = Number(seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 48 * 3600) return `${Math.round(s / 360) / 10} h`;
  return `${Math.round(s / 8640) / 10} days`;
}

async function forGuild(guildId, days, { query = sqlStore.query, now = new Date() } = {}) {
  const since = new Date(now.getTime() - days * 86400000);
  const [counts] = await query(
    `SELECT COUNT(*) AS total, SUM(status = 'open') AS open, SUM(status = 'claimed') AS claimed,
       SUM(status = 'resolved') AS resolved, SUM(status = 'dismissed') AS dismissed,
       AVG(CASE WHEN closed_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, created_at, closed_at) END) AS to_close,
       SUM(closed_at IS NOT NULL) AS closed_count
     FROM tp_cases WHERE guild_id = ? AND created_at >= ?`, [guildId, since]);
  const [claims] = await query(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, c.created_at, e.first_claim)) AS to_claim, COUNT(*) AS n FROM tp_cases c
     JOIN (SELECT case_id, MIN(created_at) AS first_claim FROM tp_case_events WHERE action = 'claimed' GROUP BY case_id) e ON e.case_id = c.id
     WHERE c.guild_id = ? AND c.created_at >= ?`, [guildId, since]);
  const [reports] = await query(
    `SELECT COUNT(*) AS reports, COUNT(DISTINCT r.reporter_id) AS reporters FROM tp_case_reports r JOIN tp_cases c ON c.id = r.case_id
     WHERE c.guild_id = ? AND c.created_at >= ?`, [guildId, since]);
  const reasons = await query(
    "SELECT reason, COUNT(*) AS n FROM tp_cases WHERE guild_id = ? AND created_at >= ? GROUP BY reason ORDER BY n DESC LIMIT 10", [guildId, since]);
  const n = value => Number(value || 0);
  return {
    total: n(counts?.total), open: n(counts?.open), claimed: n(counts?.claimed), resolved: n(counts?.resolved), dismissed: n(counts?.dismissed),
    reports: n(reports?.reports), reporters: n(reports?.reporters),
    toClaim: n(claims?.n) >= 3 ? duration(Number(claims.to_claim)) : null,
    toClose: n(counts?.closed_count) >= 3 ? duration(Number(counts.to_close)) : null,
    reasons: reasons.map(r => ({ reason: r.reason, n: n(r.n) }))
  };
}

async function casesAbout(guildId, userId, { query = sqlStore.query, limit = 25 } = {}) {
  return query("SELECT number, reason, status, created_at FROM tp_cases WHERE guild_id = ? AND target_user_id = ? ORDER BY id DESC LIMIT ?", [guildId, userId, limit]);
}

/** What Tipoff holds about someone in a server, as counts. */
async function aboutPerson(guildId, userId, { query = sqlStore.query } = {}) {
  const [reported] = await query("SELECT COUNT(*) AS n FROM tp_case_reports r JOIN tp_cases c ON c.id = r.case_id WHERE c.guild_id = ? AND r.reporter_id = ?", [guildId, userId]);
  const [about] = await query("SELECT COUNT(*) AS n FROM tp_cases WHERE guild_id = ? AND target_user_id = ?", [guildId, userId]);
  const [handled] = await query("SELECT COUNT(DISTINCT e.case_id) AS n FROM tp_case_events e JOIN tp_cases c ON c.id = e.case_id WHERE c.guild_id = ? AND e.actor_id = ? AND e.action NOT IN ('opened','joined')", [guildId, userId]);
  const [blocked] = await query("SELECT 1 AS b FROM tp_blocks WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return { reported: Number(reported?.n || 0), about: Number(about?.n || 0), handled: Number(handled?.n || 0), blocked: Boolean(blocked) };
}

module.exports = { duration, forGuild, casesAbout, aboutPerson };
