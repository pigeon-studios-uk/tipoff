/**
 * Tipoff's health, for GET /health. Each check is { name, state: "ok" | "warn" | "fail", detail }.
 *
 * /health (services/httpServer.js) answers 200 while nothing has failed and 503 when something has, and says only
 * "ok" or "fail" with the names of the failing checks, never their details. A copy's own hosted/ folder can add
 * checks (utility/hosted.js).
 */

const config = require("./config");
const sqlStore = require("./sqlStore");
const hosted = require("../utility/hosted");

// filled in by the parts that know (index.js, services/httpServer.js)
const state = {
  httpListening: false,
  migrations: null,        // { applied, total } once they've run
  migrationError: null
};

function check(name, ok, detail, warn = false) {
  return { name, state: ok ? "ok" : warn ? "warn" : "fail", detail };
}

async function collect(client, { pingDatabase = sqlStore.ping } = {}) {
  const checks = [];
  const ready = client?.isReady?.() === true;

  checks.push(check("Discord", ready, ready ? `Connected, ${Math.max(0, Math.round(client.ws.ping))} ms` : "Not connected"));
  const servers = client?.guilds?.cache?.size || 0;
  const shards = client?.ws?.shards?.size || 0;
  checks.push(check("Servers", ready, ready ? `In ${servers} server(s), ${shards} shard(s)` : "Not connected", true));

  const dbOk = await pingDatabase();
  checks.push(check("Database", dbOk, dbOk ? `OK (${config.mysql.database})` : "Can't connect"));
  checks.push(migrationsCheck());

  checks.push(check("Health endpoint", state.httpListening,
    state.httpListening ? `Listening on port ${config.http.port}` : "Not running"));
  checks.push(...hosted.checks(client, config, check));
  return checks;
}

function migrationsCheck() {
  if (state.migrationError) return check("Database schema", false, state.migrationError);
  if (!state.migrations) return check("Database schema", false, "Migrations haven't run", true);
  return check("Database schema", true, `Up to date (${state.migrations.total} migrations)`);
}

function summary(checks) {
  if (checks.some(item => item.state === "fail")) return "fail";
  if (checks.some(item => item.state === "warn")) return "warn";
  return "ok";
}

function processInfo() {
  return {
    version: config.version,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

module.exports = { state, check, collect, migrationsCheck, summary, processInfo, formatUptime };
