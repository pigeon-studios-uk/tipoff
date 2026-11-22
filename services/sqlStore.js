/**
 * MySQL: Tipoff's one database. Tables are made and changed only by numbered migrations
 * (services/migrations.js, migrations/), run on every start. Tipoff doesn't start without it (index.js).
 */

const mysql = require("mysql2/promise");
const config = require("./config");

let pool = null;

function isConfigured(db = config.mysql) {
  return Boolean(db.host && db.user && db.password && db.database);
}

function getPool() {
  if (!isConfigured()) throw new Error("The database isn't configured: set MYSQL_HOST, _USER, _PASS and _DB in .env.");
  if (!pool) {
    const db = config.mysql;
    pool = mysql.createPool({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
      // dates are stored and read as UTC, whatever the server's time zone
      timezone: "Z",
      charset: "utf8mb4",
      // Discord IDs are BIGINT UNSIGNED: always read as strings, so a snowflake never loses digits
      supportBigNumbers: true,
      bigNumberStrings: true,
      decimalNumbers: false,
      // Some hosted databases drop connections that sit idle, and a dead one then times out (ETIMEDOUT) on
      // its next use. Keep connections alive, and close idle ones well before the host would.
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      maxIdle: 2,
      idleTimeout: 60000,
      connectTimeout: 10000
    });
  }
  return pool;
}

// errors that mean the connection died, not that the query was wrong: worth one more try on a fresh connection
const CONNECTION_ERRORS = new Set(["ETIMEDOUT", "ECONNRESET", "EPIPE", "PROTOCOL_CONNECTION_LOST", "ECONNREFUSED"]);
// only statements that are safe to run twice are retried (a plain INSERT might have landed before the connection died)
const SAFE_TO_RETRY = /^\s*(SELECT|CREATE TABLE IF NOT EXISTS)\b/i;

/** Runs a query and returns its rows, or the result for INSERT/UPDATE. */
async function query(sql, params) {
  try {
    const [rows] = await getPool().query(sql, params);
    return rows;
  } catch (err) {
    if (!CONNECTION_ERRORS.has(err.code) || !SAFE_TO_RETRY.test(sql)) throw err;
    const [rows] = await getPool().query(sql, params);
    return rows;
  }
}

// MariaDB rolls back one side of a deadlock (1213) or a lock wait that took too long (1205), and says to try again
const RETRYABLE = new Set([1213, 1205]);
const TRANSACTION_ATTEMPTS = 3;

/**
 * Runs fn(connection) in a transaction: committed if it returns, rolled back if it throws. If the database rolled it
 * back to break a deadlock, the whole of fn runs again (up to 3 times), so fn must only change the database through
 * `connection` and be safe to run again from the start. Reports joining a case lock its row this way.
 */
async function transaction(fn) {
  for (let attempt = 1; ; attempt++) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback().catch(() => {});
      if (!RETRYABLE.has(err.errno) || attempt >= TRANSACTION_ATTEMPTS) throw err;
      await new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)));
    } finally {
      connection.release();
    }
  }
}

/** True if the database answers. */
async function ping() {
  if (!isConfigured()) return false;
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// A failed connection can be an AggregateError (one try per address, IPv4 and IPv6) with no message or code of its own.
function errorCode(err) {
  return err?.code || err?.errors?.find(e => e?.code)?.code || "";
}

/** A readable reason for a database error, even one with no message. */
function describe(err) {
  if (err?.message) return err.message;
  const code = errorCode(err);
  return code ? `can't connect to the database at ${config.mysql.host}:${config.mysql.port} (${code})` : String(err);
}

// The database can still be starting when Tipoff does (Docker Compose, Railway), or its hostname not resolvable yet:
// wait for it, up to a minute by default.
const NOT_UP_YET = new Set([...CONNECTION_ERRORS, "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH"]);

async function waitForDatabase(waitMs = Number(process.env.MYSQL_START_WAIT_MS ?? 60000)) {
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      await getPool().query("SELECT 1");
      return;
    } catch (err) {
      if (!NOT_UP_YET.has(errorCode(err)) || Date.now() >= until) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

let setupPromise = null;

/** Waits for the database, then runs the migrations (once per run). Resolves to { applied, total }. */
function setup() {
  if (!setupPromise) {
    setupPromise = waitForDatabase().then(() => require("./migrations").migrate(getPool())).catch(err => {
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}

async function close() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
  setupPromise = null;
}

module.exports = { isConfigured, getPool, query, transaction, ping, setup, close, describe, errorCode, SAFE_TO_RETRY };
