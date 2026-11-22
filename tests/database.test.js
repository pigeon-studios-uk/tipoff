/**
 * Migrations and the server list. The file checks need no database; the rest run against the real test database
 * (CI), and are skipped locally without one.
 */

const { databaseTest } = require("./helpers");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const migrations = require("../services/migrations");
const sqlStore = require("../services/sqlStore");
const guilds = require("../services/guilds");

/** A throwaway migrations folder: { "001_a.js": [statements] } */
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tipoff-migrations-"));
  for (const [file, statements] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), `module.exports = { statements: ${JSON.stringify(statements)} };\n`);
  }
  return dir;
}

// --- without a database ---

test("a failed connection with no message still says why Tipoff can't start", () => {
  const refused = Object.assign(new AggregateError([Object.assign(new Error("connect ECONNREFUSED ::1:3306"), { code: "ECONNREFUSED" })], ""), { message: "" });
  assert.equal(sqlStore.errorCode(refused), "ECONNREFUSED");
  assert.match(sqlStore.describe(refused), /can't connect to the database at .+ \(ECONNREFUSED\)/);
  assert.equal(sqlStore.describe(new Error("Access denied")), "Access denied");
});

test("Tipoff's own migration files are all valid", () => {
  assert.ok(migrations.load().length >= 1);
});

test("gaps, repeats, bad names and empty files are refused", () => {
  assert.throws(() => migrations.load(folder({ "001_a.js": ["SELECT 1"], "003_c.js": ["SELECT 1"] })), /expected 002/);
  assert.throws(() => migrations.load(folder({ "001_a.js": ["SELECT 1"], "001_b.js": ["SELECT 1"] })), /expected 002/);
  assert.throws(() => migrations.load(folder({ "1_a.js": ["SELECT 1"] })), /NNN_lower_case_name/);
  assert.throws(() => migrations.load(folder({ "001_a.js": [] })), /no statements/);
  assert.deepEqual(migrations.load(path.join(os.tmpdir(), "tipoff-no-such-folder")), []);
});

test("a changed migration, or one the code doesn't have, is refused", () => {
  const loaded = [{ id: 1, name: "a", file: "001_a.js", checksum: "x" }, { id: 2, name: "b", file: "002_b.js", checksum: "y" }];
  assert.deepEqual(migrations.pending(loaded, [{ id: 1, name: "a", checksum: "x" }]).map(m => m.id), [2]);
  assert.throws(() => migrations.pending(loaded, [{ id: 1, name: "a", checksum: "changed" }]), /001_a\.js was changed after it ran/);
  assert.throws(() => migrations.pending(loaded, [{ id: 3, name: "c", checksum: "z" }]), /003_c, which this version of Tipoff doesn't have/);
  assert.equal(migrations.checksum("a\r\nb"), migrations.checksum("a\nb"));
});

/** An in-memory tp_guilds, enough for guilds.js. */
function memoryGuilds() {
  const rows = new Map();
  const query = async (sql, params) => {
    if (sql.startsWith("INSERT INTO tp_guilds")) {
      const [id, joined] = params;
      const row = rows.get(String(id));
      rows.set(String(id), row ? { ...row, left_at: null } : { guild_id: String(id), joined_at: joined, left_at: null });
      return {};
    }
    if (sql.startsWith("UPDATE tp_guilds SET left_at")) {
      const [at, , id] = params;
      const row = rows.get(String(id));
      if (row && !row.left_at) row.left_at = at;
      return {};
    }
    if (sql.startsWith("SELECT guild_id, left_at")) return [...rows.values()];
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { rows, query };
}

test("reconcile: new servers joined, returning ones un-left, missing ones marked left (nothing deleted)", async () => {
  const db = memoryGuilds();
  await guilds.joined("1", { query: db.query });
  await guilds.joined("2", { query: db.query });
  await guilds.left("2", { query: db.query });
  await guilds.joined("3", { query: db.query });

  const counts = await guilds.reconcile(["1", "2", "4"], { query: db.query });
  assert.deepEqual(counts, { added: 1, back: 1, gone: 1 });
  assert.equal(db.rows.get("2").left_at, null);
  assert.ok(db.rows.get("3").left_at, "3 is marked left");
  assert.ok(db.rows.has("3"), "and kept");
  assert.ok(db.rows.has("4"));
});

test("an unavailable server (Discord outage) is never marked as left", async () => {
  const event = require("../events/guildDelete");
  let called = false;
  const original = guilds.left;
  guilds.left = async () => { called = true; };
  try {
    await event.execute({ id: "1", available: false });
    assert.equal(called, false);
    await event.execute({ id: "1", available: true });
    assert.equal(called, true);
  } finally {
    guilds.left = original;
  }
});

// --- against the real test database ---

const options = databaseTest();

after(() => sqlStore.close());

test("migrations run on the real database, and running them again does nothing", options, async () => {
  const first = await sqlStore.setup();
  assert.equal(first.total, migrations.load().length);
  await sqlStore.close();
  const again = await sqlStore.setup();
  assert.deepEqual(again.applied, []);
});

test("joining, leaving and coming back on the real database", options, async () => {
  await sqlStore.setup();
  const id = "900000000000000009";
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [id]);

  await guilds.joined(id);
  let row = await guilds.get(id);
  assert.equal(String(row.guild_id), id, "the snowflake keeps every digit");
  assert.equal(row.left_at, null);
  assert.equal(Number(row.retention_days), 90);
  assert.equal(Number(row.reporter_cooldown_minutes), 2);

  await guilds.left(id);
  row = await guilds.get(id);
  assert.ok(row.left_at);

  await guilds.joined(id);
  row = await guilds.get(id);
  assert.equal(row.left_at, null);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [id]);
});
