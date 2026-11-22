const fs = require("node:fs");
const path = require("node:path");
const { LEVELS } = require("../services/permissions");

/**
 * Buttons, menus and modals live in components/, one file per custom ID prefix (the part before the first ":"), for
 * example "case:claim:142" goes to components/case.js. Each names the level it needs, like a command, and the check
 * runs in events/interactionCreate.js before the handler. A custom ID with no handler is answered as expired.
 */
function loadComponents(directory = path.join(__dirname, "..", "components")) {
  const handlers = new Map();
  if (!fs.existsSync(directory)) return handlers;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const handler = require(path.join(directory, entry.name));
    if (!handler.prefix || !/^[a-z]+$/.test(handler.prefix) || typeof handler.execute !== "function") {
      throw new Error(`Invalid component module: ${entry.name}`);
    }
    if (!Object.hasOwn(LEVELS, handler.level)) throw new Error(`Component ${entry.name} needs a level: ${Object.keys(LEVELS).join(", ")}`);
    if (handlers.has(handler.prefix)) throw new Error(`Duplicate component prefix: ${handler.prefix}`);
    handlers.set(handler.prefix, handler);
  }
  return handlers;
}

module.exports = { loadComponents };
