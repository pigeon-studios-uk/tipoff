/**
 * The servers Tipoff is in (tp_guilds, migrations/001_guilds.js).
 *
 * Joining makes the row, or clears left_at if Tipoff is coming back within the 30 days. Leaving only sets left_at:
 * nothing is deleted until 30 days later (the retention job, phase 3). A server that's only unavailable during a
 * Discord outage isn't "left" at all (events/guildDelete.js), so an outage never wipes a server.
 */

const sqlStore = require("./sqlStore");

const KEEP_AFTER_LEAVING_DAYS = 30;

async function joined(guildId, { now = new Date(), query = sqlStore.query } = {}) {
  await query(
    `INSERT INTO tp_guilds (guild_id, joined_at, updated_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE left_at = NULL, updated_at = VALUES(updated_at)`,
    [guildId, now, now]
  );
}

async function left(guildId, { now = new Date(), query = sqlStore.query } = {}) {
  await query("UPDATE tp_guilds SET left_at = ?, updated_at = ? WHERE guild_id = ? AND left_at IS NULL", [now, now, guildId]);
}

/**
 * Brings tp_guilds in line with the servers Tipoff is in right now (on start): any it's in that have no row, or are
 * marked as left, are joined. Servers it was removed from while offline are marked as left. Returns the counts.
 */
async function reconcile(guildIds, { now = new Date(), query = sqlStore.query } = {}) {
  const present = new Set(guildIds.map(String));
  const rows = await query("SELECT guild_id, left_at FROM tp_guilds");
  const known = new Map(rows.map(row => [String(row.guild_id), row.left_at]));

  let added = 0;
  let back = 0;
  let gone = 0;
  for (const id of present) {
    if (!known.has(id)) added++;
    else if (known.get(id)) back++;
    else continue;
    await joined(id, { now, query });
  }
  for (const [id, leftAt] of known) {
    if (!present.has(id) && !leftAt) {
      await left(id, { now, query });
      gone++;
    }
  }
  return { added, back, gone };
}

async function get(guildId, { query = sqlStore.query } = {}) {
  const [row] = await query("SELECT * FROM tp_guilds WHERE guild_id = ?", [guildId]);
  return row || null;
}

module.exports = { joined, left, reconcile, get, KEEP_AFTER_LEAVING_DAYS };
