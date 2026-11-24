/**
 * Telling reporters the outcome: off by default, one switch per server. When a case is
 * resolved or dismissed, each person who reported it gets one DM, in the language they reported in. It never says what
 * action was taken, or about whom.
 */

const logger = require("./logger");
const cases = require("./cases");
const ui = require("./ui");
const strings = require("../strings");

/** DMs everyone who reported the case (except the moderator who closed it). Failures (closed DMs) are ignored. */
async function send(client, c, settings, guildName) {
  if (!settings.outcomeDms || (c.status !== "resolved" && c.status !== "dismissed")) return 0;
  const reps = await cases.reporters(c.id);
  const server = String(guildName || "").replace(/[*_`~|]/g, "");
  let sent = 0;
  for (const r of reps) {
    if (String(r.reporter_id) === String(c.closed_by)) continue;
    const t = strings.t(r.locale);
    const text = c.status === "resolved" ? t.receipts.resolved(c.number, server) : t.receipts.dismissed(c.number, server);
    try {
      const user = await client.users.fetch(String(r.reporter_id));
      await user.send(ui.card({ accent: c.status === "resolved" ? "success" : "brand", ephemeral: false, sections: [text, t.receipts.footer] }));
      sent++;
    } catch (err) {
      logger.info(`Couldn't DM a reporter about case ${c.id}: ${err.code || err.message}`);
    }
  }
  return sent;
}

module.exports = { send };
