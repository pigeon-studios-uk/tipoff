const fs = require("node:fs");
const path = require("node:path");
const { LEVELS } = require("../services/permissions");

// Where a command is registered (utility/registerCommands.js):
//   global  every server Tipoff is in
//   staff   the staff server only (STAFF_GUILD_ID): a copy's own tools, from hosted/ or staff/
const SCOPES = ["global", "staff"];

/**
 * Commands live in commands/, one file each, exporting { data, level, scope?, execute }. data is a slash command or
 * context menu builder. A command without a valid level or scope stops Tipoff starting, and so does a staff-scoped
 * command whose level isn't staff: a command in the staff server is never for anyone else.
 */
function loadCommands(directory = path.join(__dirname, "..", "commands"), { extra = false } = {}) {
  const commands = [];
  const names = new Set();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const command = require(path.join(directory, entry.name));
    if (!command.data || typeof command.execute !== "function") throw new Error(`Invalid command module: ${entry.name}`);
    if (!Object.hasOwn(LEVELS, command.level)) throw new Error(`Command ${entry.name} needs a level: ${Object.keys(LEVELS).join(", ")}`);
    // extras (utility/extras.js) are always in the staff server, at any level: the server check keeps them there
    const scope = extra ? "staff" : command.scope || "global";
    if (!SCOPES.includes(scope)) throw new Error(`Command ${entry.name}: scope must be ${SCOPES.join(" or ")}`);
    if (!extra && scope === "staff" && command.level !== "staff") throw new Error(`Command ${entry.name} is a staff command, so its level must be staff`);
    if (extra) command.scope = "staff";
    const name = command.data.name;
    if (names.has(name)) throw new Error(`Duplicate command: ${name}`);
    names.add(name);
    commands.push({ file: entry.name, command });
  }
  return commands;
}

module.exports = { loadCommands, SCOPES };
