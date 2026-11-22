/**
 * Settings, loading commands, registering them, who may run what, and the /help card. No database. The hosted
 * Tipoff's own parts are tested in hosted/tests/.
 */

const { fakeInteraction, OWNER } = require("./helpers");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Collection, MessageFlags, ComponentType } = require("discord.js");
const config = require("../services/config");
const permissions = require("../services/permissions");
const { loadCommands } = require("../utility/commandLoader");
const { loadComponents } = require("../utility/componentLoader");
const { registerCommands, payloads } = require("../utility/registerCommands");
const { authorise } = require("../events/interactionCreate");
const ui = require("../services/ui");

const commands = new Collection(loadCommands().map(({ command }) => [command.data.name, command]));

test("missingRequired names every setting Tipoff can't start without", () => {
  assert.deepEqual(config.missingRequired({}), config.REQUIRED);
  const all = Object.fromEntries(config.REQUIRED.map(key => [key, "x"]));
  assert.deepEqual(config.missingRequired(all), []);
});

test("nothing a user sees names who makes Tipoff", () => {
  const strings = JSON.stringify(require("../strings/en"), (key, value) => (typeof value === "function" ? value("x", "x", "x", "x") : value));
  assert.ok(!/pigeon/i.test(strings), "strings/en.js names the studio");
});

test("every command loads with a level, and none is staff-only", () => {
  assert.ok(commands.has("help"));
    for (const command of commands.values()) assert.notEqual(command.scope, "staff", command.data.name);
  assert.equal(commands.get("help").level, "everyone");
  assert.ok(loadComponents() instanceof Map);
});

test("every command is server-only and installs to servers, never to user accounts", () => {
  for (const command of commands.values()) {
    const json = command.data.toJSON();
    assert.deepEqual(json.contexts, [0], `${json.name} must be server-only`);
    assert.deepEqual(json.integration_types, [0], `${json.name} must be a guild install`);
  }
});

function fakeRest() {
  const calls = [];
  return { calls, put: async (route, { body }) => { calls.push({ route, body: body.map(c => c.name) }); } };
}

test("live: every command is global, and without a staff server nothing else is registered", async () => {
  const globalNames = payloads(commands).global.map(c => c.name);
  for (const name of ["help", "report", "Report Message", "Report User", "setup", "case", "reports", "privacy"]) assert.ok(globalNames.includes(name), name);
  const rest = fakeRest();
  const count = await registerCommands(commands, { rest, discord: { clientId: "1", staffGuildId: "", commandsGuildId: "" } });
  assert.equal(rest.calls.length, 1);
  assert.equal(rest.calls[0].route, "/applications/1/commands");
  assert.deepEqual(rest.calls[0].body.sort(), globalNames.sort());
  assert.equal(count.where, "global");
});

test("test copy: no global commands, everything in its one server", async () => {
  const rest = fakeRest();
  await registerCommands(commands, { rest, discord: { clientId: "1", staffGuildId: "", commandsGuildId: "9" } });
  assert.equal(rest.calls.length, 2);
  assert.deepEqual(rest.calls[0], { route: "/applications/1/commands", body: [] });
  assert.equal(rest.calls[1].route, "/applications/1/guilds/9/commands");
  assert.equal(rest.calls[1].body.length, commands.size, "every command");
});

test("levels: staff by ID only, Manage Server by permission, everyone else in a server, nobody outside one", () => {
  assert.equal(permissions.levelOf(fakeInteraction({ userId: OWNER, inGuild: false })), "staff");
  assert.equal(permissions.levelOf(fakeInteraction({ manageServer: true })), "manage_server");
  assert.equal(permissions.levelOf(fakeInteraction({ roles: ["5"] }), { moderatorRoleIds: ["5"] }), "moderator");
  assert.equal(permissions.levelOf(fakeInteraction()), "everyone");
  assert.equal(permissions.levelOf(fakeInteraction({ inGuild: false })), null);
});

test("authorise refuses anyone below a command's level, with the right reason", async () => {
  const noRoles = { moderatorRoles: async () => [] };
  assert.equal((await authorise(fakeInteraction(), "everyone", noRoles)).ok, true);
  assert.match((await authorise(fakeInteraction(), "manage_server", noRoles)).reason, /Manage Server/);
  assert.match((await authorise(fakeInteraction({ manageServer: true }), "staff", noRoles)).reason, /staff/);
  assert.match((await authorise(fakeInteraction({ inGuild: false }), "everyone", noRoles)).reason, /inside a server/);
  assert.equal((await authorise(fakeInteraction({ userId: OWNER }), "staff", noRoles)).ok, true);
});

test("moderator: a moderator role counts, and the roles are only read when they could matter", async () => {
  let reads = 0;
  const moderatorRoles = async () => { reads++; return ["5"]; };
  assert.equal((await authorise(fakeInteraction({ roles: ["5"] }), "moderator", { moderatorRoles })).ok, true);
  assert.match((await authorise(fakeInteraction({ roles: ["6"] }), "moderator", { moderatorRoles })).reason, /moderators/);
  assert.equal((await authorise(fakeInteraction({ manageServer: true }), "moderator", { moderatorRoles })).ok, true);
  assert.equal(reads, 2, "not read for someone with Manage Server");
});

function texts(body) {
  const out = [];
  const walk = component => {
    const json = typeof component.toJSON === "function" ? component.toJSON() : component;
    if (json.type === ComponentType.TextDisplay) out.push(json.content);
    for (const child of json.components || []) walk(child);
  };
  body.components.forEach(walk);
  return out.join("\n");
}

test("/help is a private Components V2 card, pings nobody, and leaves out links that aren't live", () => {
  const body = commands.get("help").helpCard({ ...config.links, guide: "", privacy: "", terms: "", support: "", website: "" });
  assert.ok(body.flags & MessageFlags.IsComponentsV2);
  assert.ok(body.flags & MessageFlags.Ephemeral);
  assert.deepEqual(body.allowedMentions, { parse: [] });
  const text = texts(body);
  assert.match(text, /Report Message/);
  assert.match(text, /Report User/);
  assert.match(text, /\/setup channels/);
  const json = body.components[0].toJSON();
  assert.ok(!json.components.some(c => c.type === ComponentType.ActionRow), "no buttons without links");

  const withLinks = commands.get("help").helpCard({ ...config.links, guide: "https://example.com/guide", privacy: "", terms: "", website: "", support: "https://discord.gg/x" });
  const row = withLinks.components[0].toJSON().components.find(c => c.type === ComponentType.ActionRow);
  assert.deepEqual(row.components.map(b => b.label), ["Guide", "Support server"]);
});

test("cards never go over Discord's text limit", () => {
  const body = ui.card({ sections: ["a".repeat(3000), "b".repeat(3000), "c".repeat(10)] });
  const blocks = body.components[0].toJSON().components.filter(c => c.type === ComponentType.TextDisplay);
  assert.equal(blocks.reduce((sum, c) => sum + c.content.length, 0), ui.TEXT_LIMIT);
  assert.equal(blocks.length, 2, "nothing is added once the card is full");
});

