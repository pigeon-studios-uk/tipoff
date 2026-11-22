/**
 * Deleting on time. Nothing is kept "just in case".
 *
 *   every 5 minutes  report drafts older than 30 minutes
 *   every hour       closed cases older than their server's retention (default 90 days, 30 to 365)
 *                    open cases older than a year
 *                    servers Tipoff left more than 30 days ago, with everything of theirs
 *                    cool-down rows older than a day, audit entries older than a year, old alert markers
 *
 * A case's evidence, reports and events go with it (foreign keys). The cards in servers' own channels belong to those
 * servers and are left alone.
 */

const sqlStore = require("./sqlStore");
const logger = require("./logger");
const reports = require("./reports");
const guilds = require("./guilds");

const BATCH = 500;
const DAY = 86400000;
// every table that holds a server's own data, besides tp_cases (whose children cascade)
const GUILD_TABLES = ["tp_guild_roles", "tp_guild_reasons", "tp_blocks", "tp_limits", "tp_report_drafts", "tp_audit", "tp_alerts", "tp_forum_tags"];

async function deleteCases(ids, query) {
  if (!ids.length) return 0;
  const result = await query(`DELETE FROM tp_cases WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  return Number(result?.affectedRows || 0);
}

/** Deletes in batches until nothing's left (so a big backlog doesn't hold a long lock). */
async function inBatches(select, query) {
  let total = 0;
  for (;;) {
    const ids = (await select()).map(row => row.id);
    total += await deleteCases(ids, query);
    if (ids.length < BATCH) return total;
  }
}

async function run({ query = sqlStore.query, now = new Date() } = {}) {
  const counts = {};

  counts.closedCases = await inBatches(() => query(
    `SELECT c.id FROM tp_cases c JOIN tp_guilds g ON g.guild_id = c.guild_id
     WHERE c.status IN ('resolved','dismissed') AND c.closed_at < DATE_SUB(?, INTERVAL g.retention_days DAY) LIMIT ${BATCH}`, [now]), query);

  counts.oldOpenCases = await inBatches(() => query(
    `SELECT id FROM tp_cases WHERE status IN ('open','claimed') AND created_at < ? LIMIT ${BATCH}`, [new Date(now.getTime() - 365 * DAY)]), query);

  const gone = await query("SELECT guild_id FROM tp_guilds WHERE left_at IS NOT NULL AND left_at < ?",
    [new Date(now.getTime() - guilds.KEEP_AFTER_LEAVING_DAYS * DAY)]);
  counts.servers = 0;
  for (const { guild_id: guildId } of gone) {
    await inBatches(() => query(`SELECT id FROM tp_cases WHERE guild_id = ? LIMIT ${BATCH}`, [guildId]), query);
    for (const table of GUILD_TABLES) await query(`DELETE FROM ${table} WHERE guild_id = ?`, [guildId]);
    await query("DELETE FROM tp_guilds WHERE guild_id = ? AND left_at IS NOT NULL", [guildId]);
    counts.servers++;
  }

  const dayAgo = new Date(now.getTime() - DAY);
  counts.limits = Number((await query(
    "DELETE FROM tp_limits WHERE (last_report_at IS NULL OR last_report_at < ?) AND (last_urgent_at IS NULL OR last_urgent_at < ?)", [dayAgo, dayAgo]))?.affectedRows || 0);
  counts.audit = Number((await query("DELETE FROM tp_audit WHERE created_at < ?", [new Date(now.getTime() - 365 * DAY)]))?.affectedRows || 0);
  await query("DELETE FROM tp_alerts WHERE last_sent_at < ?", [new Date(now.getTime() - 7 * DAY)]);
  counts.drafts = await reports.pruneDrafts({ query, now });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total) logger.info(`Retention: ${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")} deleted`);
  return counts;
}

let timers = [];

/** Starts the jobs (index.js). A failed run is logged and tried again next time. */
function start() {
  stop();
  const safe = (name, fn) => () => fn().catch(err => logger.error(`${name} failed: ${err.stack || err}`));
  const hourly = safe("Retention", () => run());
  const drafts = safe("Draft clean-up", () => reports.pruneDrafts());
  timers = [setInterval(hourly, 60 * 60 * 1000), setInterval(drafts, 5 * 60 * 1000), setTimeout(hourly, 60 * 1000)];
  timers.forEach(timer => timer.unref?.());
}

function stop() {
  for (const timer of timers) {
    clearInterval(timer);
    clearTimeout(timer);
  }
  timers = [];
}

module.exports = { run, start, stop, GUILD_TABLES };
