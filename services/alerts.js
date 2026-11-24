/**
 * Telling a server's admins that Tipoff can't post reports. Without this, a report could fail silently: the
 * reporter would get a vague error and the admins would never know.
 *
 * Told once per problem every 6 hours (tp_alerts), not once per report: in the report channel if Tipoff can still post
 * there (for example the problem is the escalation channel), otherwise by DM to the server owner.
 */

const { PermissionFlagsBits } = require("discord.js");
const sqlStore = require("./sqlStore");
const logger = require("./logger");
const ui = require("./ui");
const strings = require("../strings");

const EVERY_MS = 6 * 60 * 60 * 1000;

/** Records that an alert is being sent, unless one went out in the last 6 hours. True if this one should be sent. */
async function take(guildId, kind, { query = sqlStore.query, now = new Date() } = {}) {
  await query("INSERT IGNORE INTO tp_alerts (guild_id, kind, last_sent_at) VALUES (?, ?, '1970-01-01 00:00:00')", [guildId, kind]);
  const result = await query("UPDATE tp_alerts SET last_sent_at = ? WHERE guild_id = ? AND kind = ? AND last_sent_at <= ?",
    [now, guildId, kind, new Date(now.getTime() - EVERY_MS)]);
  return Number(result?.affectedRows || 0) === 1;
}

async function clear(guildId, kind, { query = sqlStore.query } = {}) {
  await query("DELETE FROM tp_alerts WHERE guild_id = ? AND kind = ?", [guildId, kind]);
}

/**
 * Tells the admins, in the server's language. what: which channel, as a key of setup.channelNames ("escalation");
 * problem: why, as a key of alerts.problems ("noAccess"). Text that isn't a key is shown as it is.
 */
async function failing(client, guildId, settings, what, problem, { kind = "delivery" } = {}) {
  if (!(await take(guildId, kind))) return false;
  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) return false;
  const t = strings.forServer(settings, guild);
  what = t.setup.channelNames[what] || what;
  problem = t.alerts.problems[problem] || problem;
  const body = ui.card({ accent: "warning", ephemeral: false, sections: [t.alerts.failing(what, problem)] });

  const report = settings.reportChannelId ? guild.channels.cache.get(settings.reportChannelId) : null;
  const me = guild.members.me;
  if (report && me && report.isTextBased?.() && report.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    try {
      await report.send(body);
      return true;
    } catch (err) {
      logger.warn(`Couldn't post a delivery alert in server ${guildId}: ${err.message}`);
    }
  }
  try {
    const owner = await guild.fetchOwner();
    await owner.send(ui.card({ accent: "warning", ephemeral: false, sections: [t.alerts.failing(what, problem), t.alerts.ownerDm(guild.name.replace(/[*_`~|]/g, ""))] }));
    return true;
  } catch (err) {
    logger.warn(`Couldn't DM the owner of server ${guildId} about a delivery problem: ${err.message}`);
    return false;
  }
}

module.exports = { EVERY_MS, take, clear, failing };
