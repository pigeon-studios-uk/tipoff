const path = require("node:path");
const fs = require("node:fs");
const config = require("./services/config");
const logger = require("./services/logger");
// before anything that could emit a Node warning (utility/warnings.js)
require("./utility/warnings").install(logger);
// this copy's own parts, if it has a hosted/ folder (utility/hosted.js): for the hosted Tipoff, error reports and
// the heartbeat. Started as early as possible so error reports catch start-up problems.
const hosted = require("./utility/hosted");
hosted.init({ logger, config });

const chalk = require("chalk");
const figlet = require("figlet");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const sqlStore = require("./services/sqlStore");
const health = require("./services/health");
const httpServer = require("./services/httpServer");
const retention = require("./services/retention");
const { loadComponents } = require("./utility/componentLoader");
const { loadCommands } = require("./utility/commandLoader");
const extrasLoader = require("./utility/extras");
const migrations = require("./services/migrations");

const ORANGE = "#ff6200";

// The same start-up banner and health check layout as the studio's other bots, so every console looks alike.
function banner() {
  console.clear();
  const tag = chalk.hex(ORANGE)("[ server:TIPOFF ]");
  const rule = chalk.gray("-".repeat(60));
  const ascii = figlet.textSync("TIPOFF", { font: "Standard" });

  logger.raw(`${tag} ${rule}`);
  logger.raw(ascii.split("\n").map(line => `${tag}  ${chalk.hex(ORANGE)(line)}`).join("\n"));
  logger.raw(tag);
  logger.raw(`${tag}  APPLICATION        : ${chalk.cyan(config.name)}`);
  logger.raw(`${tag}  VERSION            : ${chalk.green(config.version)}`);
  logger.raw(`${tag}  NODE.JS            : ${chalk.green(process.version)}`);
  logger.raw(`${tag}  MODE               : ${config.discord.commandsGuildId ? chalk.yellow("Test (commands in one server)") : chalk.green("Live (global commands)")}`);
  logger.raw(tag);
  logger.raw(`${tag}  ${chalk.gray(`Copyright ${new Date().getFullYear()} Pigeon Studios. All Rights Reserved.`)}`);
  logger.raw(`${tag} ${rule}`);
  logger.raw("");
}

function systemHealthPreCheck() {
  const pad = text => text.padEnd(22, " ");
  const set = value => (value ? "OK" : "Missing");

  logger.info("System Startup Health Check");
  logger.info("--------------------------------------------");
  logger.info(`${pad("DISCORD_TOKEN")}: ${set(config.discord.token)}`);
  logger.info(`${pad("DISCORD_CLIENT_ID")}: ${set(config.discord.clientId)}`);
  logger.info(`${pad("STAFF_GUILD_ID")}: ${config.discord.staffGuildId || "Not set (no staff commands)"}`);
  logger.info(`${pad("COMMANDS_GUILD_ID")}: ${config.discord.commandsGuildId || "Not set (global commands)"}`);
  logger.info(`${pad("DATABASE")}: ${sqlStore.isConfigured() ? `Configured (${config.mysql.database})` : "Missing"}`);
  logger.info(`${pad("HEALTH PORT")}: ${config.http.port}`);
  for (const [label, value] of hosted.preCheck(config)) logger.info(`${pad(label)}: ${value}`);
  logger.info("--------------------------------------------\n");
}

/**
 * Ends the process with `code` once everything has closed. Never process.exit() straight after closing connections:
 * on Windows that can abort Node mid-exit while sockets are still closing. The backstop only fires if something stays
 * open.
 */
function finish(code) {
  process.exitCode = code;
  const backstop = setTimeout(() => {
    logger.warn(`Still open 5 seconds after shutting down (${process.getActiveResourcesInfo().join(", ")}); forcing the exit`);
    process.exit(code);
  }, 5000);
  backstop.unref();
}

async function main() {
  banner();
  systemHealthPreCheck();

  const missing = config.missingRequired();
  if (missing.length) {
    logger.error(`Can't start: missing in .env: ${missing.join(", ")}. See .env.example.`);
    return finish(1);
  }

  // the database, brought up to date; Tipoff doesn't start on a schema it doesn't match (services/migrations.js)
  try {
    health.state.migrations = await sqlStore.setup();
    logger.success(`Database ready (${config.mysql.database}, ${health.state.migrations.total} migrations, ${health.state.migrations.applied.length} new)`);
  } catch (err) {
    logger.error(`Can't start: ${err.message}`);
    await sqlStore.close();
    await hosted.flush();
    return finish(1);
  }

  // optional extras for the hosted Tipoff (staff/, not in this repository; utility/extras.js). Their migrations are
  // recorded apart from Tipoff's own, so the public schema history never depends on them.
  let extras = null;
  try {
    extras = extrasLoader.load();
    if (extras) {
      const done = await migrations.migrate(sqlStore.getPool(), {
        dir: extras.migrationsDir, table: "tp_extra_migrations", lockName: "tipoff_extra_migrations", log: line => logger.info(line)
      });
      logger.success(`Extras loaded from staff/ (${extras.commands.length} commands, ${extras.components.size} components, ${extras.events.length} events, ${done.total} migrations, ${done.applied.length} new)`);
    }
  } catch (err) {
    logger.error(`Can't start: the extras in staff/ didn't load: ${err.message}`);
    await sqlStore.close();
    await hosted.flush();
    return finish(1);
  }

  // Guilds is the only intent Tipoff needs, now and later: everything a report needs arrives in the interaction itself,
  // so it never reads messages or member lists. shards: "auto" asks Discord how many shards to run and runs
  // them all in this process, so growing into thousands of servers needs no rewrite. Nobody is pinged unless a message
  // names them.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    shards: "auto",
    allowedMentions: { parse: [], repliedUser: false }
  });

  client.components = loadComponents();
  if (extras) extrasLoader.mergeComponents(client.components, extras.components);
  client.commands = new Collection();
  const hostedCommands = hosted.commandsDir ? loadCommands(hosted.commandsDir).map(entry => ({ ...entry, file: `hosted/${entry.file}` })) : [];
  for (const { file, command } of [...loadCommands(), ...hostedCommands, ...(extras?.commands || [])]) {
    if (client.commands.has(command.data.name)) throw new Error(`Duplicate command: ${command.data.name}`);
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command ${command.data.name} (${command.extra ? "staff/" : ""}${file}, ${command.level}, ${command.scope || "global"})`);
  }

  const eventsDir = path.join(__dirname, "events");
  const coreEvents = fs.readdirSync(eventsDir).filter(name => name.endsWith(".js")).map(file => require(path.join(eventsDir, file)));
  for (const event of [...coreEvents, ...(extras?.events || [])]) {
    const handler = (...args) => Promise.resolve(event.execute(...args, client)).catch(err => {
      logger.error(`Event ${event.name} failed: ${err.stack || err}`);
    });
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
  }

  client.on("error", err => logger.error(`Discord client error: ${err.message}`));
  client.on("shardDisconnect", (_, id) => logger.warn(`Shard ${id} disconnected from Discord; reconnecting`));

  await httpServer.start(client);
  await client.login(config.discord.token);

  // deleting on time: drafts, closed cases, servers Tipoff left (services/retention.js)
  retention.start();
  if (extras?.start) await Promise.resolve(extras.start(client)).catch(err => logger.error(`Extras didn't start: ${err.stack || err}`));

  let closing = false;
  const shutdown = async (signal, code = 0) => {
    if (closing) return;
    closing = true;
    logger.warn(`${signal}: shutting down`);
    hosted.stop();
    retention.stop();
    if (extras?.stop) await Promise.resolve(extras.stop()).catch(() => {});
    await httpServer.stop();
    await client.destroy().catch(() => {});
    process.env.TIPOFF_CLOSING = "1";
    await sqlStore.close();
    await hosted.flush();
    finish(code);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // this copy's own parts that run alongside, if any (for the hosted Tipoff: restarting after a deploy)
  hosted.start({ shutdown });
}

// Logged and reported, then the process carries on only for rejections; an uncaught exception is handled by error
// tracking's integration (which exits), or below when error reports are off. Carrying on after one would
// leave Tipoff in an unknown state.
process.on("unhandledRejection", err => logger.error(`Unhandled rejection: ${err?.stack || err}`));
if (!hosted.errorReportsOn()) {
  process.on("uncaughtException", err => {
    logger.error(`Uncaught exception, stopping: ${err?.stack || err}`);
    finish(1);
    setImmediate(() => process.exit(1));
  });
}

main().catch(async err => {
  logger.error(`Startup failed: ${err.stack || err}`);
  await httpServer.stop();
  await sqlStore.close();
  await hosted.flush();
  finish(1);
});
