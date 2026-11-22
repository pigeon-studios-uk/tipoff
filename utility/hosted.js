const fs = require("node:fs");
const path = require("node:path");

/**
 * Optional parts for one particular copy of Tipoff, from a hosted/ folder if there is one: monitoring, deploy
 * restarts, the copy's own owner tools and its default links. Without the folder every hook below does nothing, and
 * Tipoff is the complete report bot.
 *
 * hosted/index.js may export any of:
 *   links          default public links (each can still be set in .env)
 *   commandsDir    a folder of commands, loaded like commands/ (staff-scoped ones go to STAFF_GUILD_ID only)
 *   init({ logger, config })            as early as possible
 *   errorReportsOn()                    true if errors are reported somewhere
 *   preCheck(config)                    [label, value] lines for the start-up health check
 *   checks(client, config, check)       extra health checks for GET /health
 *   onReady(client, { config, logger }) once connected to Discord
 *   start({ shutdown })                 after login; shutdown(reason, code) stops Tipoff cleanly
 *   stop()                              while shutting down
 *   flush()                             last thing before exiting
 */

const DIR = path.join(__dirname, "..", "hosted");

const NONE = {
  present: false,
  links: {},
  commandsDir: null,
  init() {},
  errorReportsOn: () => false,
  preCheck: () => [],
  checks: () => [],
  onReady() {},
  start() {},
  stop() {},
  flush: async () => {}
};

function load(dir = DIR) {
  const file = path.join(dir, "index.js");
  if (!fs.existsSync(file)) return NONE;
  const hosted = require(file);
  return { ...NONE, ...hosted, present: true, commandsDir: hosted.commandsDir && fs.existsSync(hosted.commandsDir) ? hosted.commandsDir : null };
}

module.exports = load();
module.exports.load = load;
module.exports.NONE = NONE;
