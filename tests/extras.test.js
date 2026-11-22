// The staff/ hook (utility/extras.js): Tipoff runs the same without it, and extras only ever work in the
// staff server.
const { STAFF_GUILD } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const extras = require("../utility/extras");
const { payloads } = require("../utility/registerCommands");
const interactionCreate = require("../events/interactionCreate");

// A staff/ folder on disk. Its modules don't require anything, so they load from a temporary folder.
function fixture({ components = true, prefix = "ticket" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tipoff-extras-"));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  write("commands/ban.js", `module.exports = { level: "moderator", data: { name: "ban", toJSON: () => ({ name: "ban" }) }, execute: async () => { global.__ran = "ban"; } };`);
  if (components) write(`components/${prefix}.js`, `module.exports = { prefix: "${prefix}", level: "everyone", execute: async () => { global.__ran = "${prefix}"; } };`);
  write("events/tick.js", `module.exports = { name: "tick", execute: () => {} };`);
  write("index.js", `module.exports = { start: () => {}, stop: () => {} };`);
  return dir;
}

test("no staff/ folder: no extras, and Tipoff loads as the report bot", () => {
  assert.equal(extras.load(path.join(os.tmpdir(), "tipoff-no-such-folder")), null);
});

test("extras load, at any level, always scoped to the staff server", () => {
  const loaded = extras.load(fixture());
  assert.equal(loaded.commands.length, 1);
  const ban = loaded.commands[0].command;
  assert.equal(ban.extra, true);
  assert.equal(ban.scope, "staff");
  assert.equal(ban.level, "moderator");
  assert.equal(loaded.components.get("ticket").extra, true);
  assert.equal(loaded.events.length, 1);
  assert.equal(typeof loaded.start, "function");
  assert.equal(process.env.TIPOFF_ROOT, require("../services/config").root);
});

test("extras' commands are registered in the staff server only", () => {
  const loaded = extras.load(fixture());
  const all = new Map([["help", { scope: "global", data: { toJSON: () => ({ name: "help" }) } }], ["ban", loaded.commands[0].command]]);
  const { global, staff } = payloads(all);
  assert.deepEqual(global.map(c => c.name), ["help"]);
  assert.deepEqual(staff.map(c => c.name), ["ban"]);
});

test("an extra component can't take one of Tipoff's prefixes", () => {
  const loaded = extras.load(fixture({ prefix: "case" }));
  assert.throws(() => extras.mergeComponents(new Map([["case", {}]]), loaded.components), /already Tipoff's/);
});

test("extras only run in the staff server", () => {
  assert.equal(extras.allowedHere({ extra: true }, { guildId: STAFF_GUILD }), true);
  assert.equal(extras.allowedHere({ extra: true }, { guildId: "999" }), false);
  assert.equal(extras.allowedHere({ extra: true }, { guildId: null }), false);
  assert.equal(extras.allowedHere({}, { guildId: "999" }), true);
});

function interaction({ guildId, kind = "command", name = "ban", customId = "ticket:open" }) {
  const replies = [];
  return {
    replies,
    guildId,
    commandName: name,
    customId,
    user: { id: "300000000000000003" },
    inGuild: () => true,
    member: { roles: { cache: new Map() } },
    memberPermissions: { has: () => true },
    isChatInputCommand: () => kind === "command",
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => kind === "button",
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    reply: async body => { replies.push(body); }
  };
}

test("an extra command or button used outside the staff server does nothing", async () => {
  const loaded = extras.load(fixture());
  const client = { commands: new Map([["ban", loaded.commands[0].command]]), components: loaded.components };

  global.__ran = null;
  const outside = interaction({ guildId: "999" });
  await interactionCreate.execute(outside, client);
  assert.equal(global.__ran, null);
  assert.equal(outside.replies.length, 1);

  const button = interaction({ guildId: "999", kind: "button" });
  await interactionCreate.execute(button, client);
  assert.equal(global.__ran, null);

  await interactionCreate.execute(interaction({ guildId: STAFF_GUILD }), client);
  assert.equal(global.__ran, "ban");
  global.__ran = null;
  await interactionCreate.execute(interaction({ guildId: STAFF_GUILD, kind: "button" }), client);
  assert.equal(global.__ran, "ticket");
});
