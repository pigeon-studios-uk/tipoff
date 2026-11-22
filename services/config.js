/**
 * Settings from the environment (.env on the server). Only secrets and what Tipoff needs before it can read its
 * database live here; everything a server changes is stored in MySQL and changed with /setup.
 *
 * Tipoff is a public bot: it works in every server it's invited to. Two servers can be special:
 *   STAFF_GUILD_ID     optional: where this copy's own staff commands are registered (from hosted/ or staff/),
 *                      usable only by OWNER_IDS. Without it, there are no staff commands.
 *   COMMANDS_GUILD_ID  for testing: every command is registered in this one server instead of globally, so changes
 *                      show at once and the test copy's commands never appear anywhere else. Empty when live.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");

// Node 24 reads .env itself; variables already set (by CI or the shell) win over the file.
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const env = process.env;

// this copy's default public links (hosted/links.js), if it has them; .env can set any of them
const HOSTED_LINKS = path.join(ROOT, "hosted", "links.js");
const defaults = fs.existsSync(HOSTED_LINKS) ? require(HOSTED_LINKS) : {};
const link = (key, setting) => String(env[setting] || defaults[key] || "").trim();

function list(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

const config = {
  root: ROOT,
  name: "Tipoff",
  version: require("../package.json").version,

  discord: {
    token: env.DISCORD_TOKEN || "",
    clientId: env.DISCORD_CLIENT_ID || "",
    staffGuildId: env.STAFF_GUILD_ID || "",
    commandsGuildId: env.COMMANDS_GUILD_ID || "",
    // Discord user IDs of this copy's own staff, for its staff commands. Nobody else, whatever their server role.
    ownerIds: list(env.OWNER_IDS)
  },

  mysql: {
    host: env.MYSQL_HOST || "",
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || "",
    password: env.MYSQL_PASS || "",
    database: env.MYSQL_DB || ""
  },

  http: {
    // HTTP_PORT if set; otherwise the port the host gives (SERVER_PORT on Pterodactyl panels, PORT on
    // Railway and most clouds). Only /health is served (services/httpServer.js).
    port: Number(env.HTTP_PORT || env.SERVER_PORT || env.PORT || 3000)
  },

  // Public links shown in /help and elsewhere. An empty link isn't shown. Someone running their own copy sets their
  // own (their privacy policy and terms, not ours).
  links: {
    website: link("website", "WEBSITE_URL"),
    guide: link("guide", "GUIDE_URL"),
    privacy: link("privacy", "PRIVACY_URL"),
    terms: link("terms", "TERMS_URL"),
    support: link("support", "SUPPORT_URL"),
    status: link("status", "STATUS_URL"),
    discordSafety: "https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord"
  },

  colours: {
    orange: 0xff6200,
    ink: 0x0f1015
  }
};

const REQUIRED = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "MYSQL_HOST", "MYSQL_USER", "MYSQL_PASS", "MYSQL_DB"];

/** What's missing for Tipoff to start at all. */
function missingRequired(source = env) {
  return REQUIRED.filter(key => !source[key]);
}

module.exports = config;
module.exports.missingRequired = missingRequired;
module.exports.list = list;
module.exports.REQUIRED = REQUIRED;
