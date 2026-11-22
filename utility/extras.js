const fs = require("node:fs");
const path = require("node:path");
const config = require("../services/config");
const { loadCommands } = require("./commandLoader");
const { loadComponents } = require("./componentLoader");

const DIR = path.join(config.root, "staff");

/**
 * Optional extras for the hosted Tipoff. They live in a staff/ folder that isn't part of this repository
 * (.gitignore), and Tipoff runs exactly the same without it.
 *
 * If staff/ is there, it's laid out like Tipoff itself, each part optional:
 *
 *   staff/commands/     commands, as in commands/ (any level; the scope is always the staff server)
 *   staff/components/   buttons, menus and modals, as in components/
 *   staff/events/       Discord events, as in events/
 *   staff/migrations/   numbered migrations, recorded apart from Tipoff's own (tp_extra_migrations)
 *   staff/index.js      { start(client), stop() }, if it needs either
 *
 * The rules, enforced here and in events/interactionCreate.js rather than trusted:
 *   - extras' commands are registered in STAFF_GUILD_ID only, and refused anywhere else
 *   - extras' buttons, menus and modals do nothing outside STAFF_GUILD_ID
 *   - extras never change Tipoff's intents (Guilds only)
 */
function load(dir = DIR) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;

  // so extras can find Tipoff's own modules, wherever their folder really is
  process.env.TIPOFF_ROOT = config.root;

  const sub = name => path.join(dir, name);
  const commands = fs.existsSync(sub("commands")) ? loadCommands(sub("commands"), { extra: true }) : [];
  for (const { command } of commands) command.extra = true;

  const components = loadComponents(sub("components"));
  for (const handler of components.values()) handler.extra = true;

  const events = [];
  if (fs.existsSync(sub("events"))) {
    for (const file of fs.readdirSync(sub("events")).filter(name => name.endsWith(".js"))) {
      const event = require(path.join(sub("events"), file));
      if (!event.name || typeof event.execute !== "function") throw new Error(`Invalid extra event module: ${file}`);
      events.push(event);
    }
  }

  const main = fs.existsSync(sub("index.js")) ? require(sub("index.js")) : {};
  return {
    dir,
    commands,
    components,
    events,
    migrationsDir: sub("migrations"),
    start: typeof main.start === "function" ? main.start : null,
    stop: typeof main.stop === "function" ? main.stop : null
  };
}

/** Adds extras' components to Tipoff's, refusing a prefix both use. */
function mergeComponents(core, extra) {
  for (const [prefix, handler] of extra) {
    if (core.has(prefix)) throw new Error(`Extra component prefix "${prefix}" is already Tipoff's`);
    core.set(prefix, handler);
  }
  return core;
}

/** True if this extra command or component may run for this interaction: only in the staff server. */
function allowedHere(handler, interaction) {
  if (!handler?.extra) return true;
  return Boolean(interaction.guildId) && String(interaction.guildId) === String(config.discord.staffGuildId);
}

module.exports = { DIR, load, mergeComponents, allowedHere };
