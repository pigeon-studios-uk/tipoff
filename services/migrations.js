/**
 * Numbered database migrations, run on every start:
 *
 *   migrations/001_guilds.js
 *   migrations/002_....js
 *
 * A migration file is named NNN_lower_case_name.js and exports { statements: ["CREATE TABLE ...", ...] }. Files run
 * in number order, once each, and each one is recorded in tp_schema_migrations with a checksum of its contents.
 *
 * The rules, so the schema on the server is always exactly what the code expects:
 *   - A migration that has run is never edited. If its file changes, Tipoff refuses to start and says which one.
 *     Change the schema with a new migration instead.
 *   - Numbers are unique and have no gaps (001, 002, 003...).
 *   - If the database has a migration this copy of the code doesn't (an older version deployed over a newer
 *     schema), Tipoff refuses to start rather than run against tables it doesn't understand.
 *   - Only one process migrates at a time (a named database lock), so two starts can't run the same migration.
 *
 * MySQL can't roll back CREATE or ALTER, so a migration that fails part way leaves what it already did. Keep one
 * change per statement and write them so running the file again is safe (CREATE TABLE IF NOT EXISTS, and so on):
 * a failed migration isn't recorded, so the next start runs it again from the top.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DIR = path.join(__dirname, "..", "migrations");
const TABLE = "tp_schema_migrations";
const FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.js$/;
const LOCK_NAME = "tipoff_migrations";
const LOCK_TIMEOUT_SECONDS = 30;

/** sha256 of a migration file, with line endings normalised so a Windows checkout gives the same checksum. */
function checksum(text) {
  return crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex");
}

/**
 * The migrations, in order: [{ id, name, file, checksum, statements }]. Throws on a badly named file, a duplicate or
 * missing number, or a file without statements. A folder that doesn't exist has none.
 */
function load(dir = DIR) {
  if (!fs.existsSync(dir)) return [];

  const migrations = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".") || entry.name.endsWith(".md")) continue;
    const match = FILE_PATTERN.exec(entry.name);
    if (!match) throw new Error(`migrations/${entry.name}: migration files are named NNN_lower_case_name.js`);

    const file = path.join(dir, entry.name);
    const text = fs.readFileSync(file, "utf8");
    delete require.cache[require.resolve(file)];
    const { statements } = require(file);
    if (!Array.isArray(statements) || !statements.length || statements.some(sql => typeof sql !== "string" || !sql.trim())) {
      throw new Error(`migrations/${entry.name}: exports no statements (module.exports = { statements: ["..."] })`);
    }
    migrations.push({ id: Number(match[1]), name: match[2], file: entry.name, checksum: checksum(text), statements });
  }

  migrations.sort((a, b) => a.id - b.id);
  migrations.forEach((migration, index) => {
    if (migration.id !== index + 1) {
      const expected = String(index + 1).padStart(3, "0");
      throw new Error(`migrations: expected ${expected} next, found ${migration.file} (numbers start at 001, with no gaps or repeats)`);
    }
  });
  return migrations;
}

/**
 * Compares the migrations on disk with those recorded in the database. Returns the ones still to run, or throws if
 * a recorded one was changed or is missing from the code.
 */
function pending(migrations, applied) {
  const byId = new Map(migrations.map(migration => [migration.id, migration]));
  for (const row of applied) {
    const migration = byId.get(Number(row.id));
    if (!migration) {
      throw new Error(`The database has migration ${String(row.id).padStart(3, "0")}_${row.name}, which this version of Tipoff doesn't have. Deploy the newer version; never run older code on a newer schema.`);
    }
    if (migration.checksum !== row.checksum) {
      throw new Error(`migrations/${migration.file} was changed after it ran. Put it back as it was, and make the change in a new migration.`);
    }
  }
  const done = new Set(applied.map(row => Number(row.id)));
  return migrations.filter(migration => !done.has(migration.id));
}

/** Brings the database up to date. pool is a mysql2/promise pool. Resolves to { applied: [file...], total }. */
async function migrate(pool, { dir = DIR, table = TABLE, lockName = LOCK_NAME, log = () => {} } = {}) {
  const migrations = load(dir);
  const connection = await pool.getConnection();
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?, ?) AS got", [lockName, LOCK_TIMEOUT_SECONDS]);
    if (Number(lock.got) !== 1) throw new Error(`Another copy of Tipoff is migrating the database (waited ${LOCK_TIMEOUT_SECONDS}s)`);

    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS ${table} (
        id INT UNSIGNED NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

      const [applied] = await connection.query(`SELECT id, name, checksum FROM ${table} ORDER BY id`);
      const todo = pending(migrations, applied);
      for (const migration of todo) {
        for (const sql of migration.statements) await connection.query(sql);
        await connection.query(`INSERT INTO ${table} (id, name, checksum, applied_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
          [migration.id, migration.name, migration.checksum]);
        log(`Migration ${migration.file} applied`);
      }
      return { applied: todo.map(migration => migration.file), total: migrations.length };
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
    }
  } finally {
    connection.release();
  }
}

module.exports = { DIR, TABLE, FILE_PATTERN, checksum, load, pending, migrate };
