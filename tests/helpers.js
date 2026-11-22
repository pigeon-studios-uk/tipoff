/**
 * Shared test set-up. Every test file requires this first, so Tipoff's modules load with test settings.
 *
 * Database tests use a real MariaDB/MySQL database from the MYSQL_* variables (CI sets them; see .gitlab-ci.yml).
 * Locally, without MYSQL_HOST, they're skipped; in CI a missing database is a failure, never a skip.
 */

process.env.NODE_ENV = "test";
process.env.DISCORD_TOKEN ||= "test-token";
process.env.DISCORD_CLIENT_ID ||= "100000000000000001";
process.env.STAFF_GUILD_ID ||= "200000000000000002";
process.env.OWNER_IDS ||= "400000000000000004";

const hasDatabase = Boolean(process.env.MYSQL_HOST);
const inCi = Boolean(process.env.CI);

const OWNER = "400000000000000004";
const STAFF_GUILD = process.env.STAFF_GUILD_ID;

/** test() options for database tests: skipped locally without a database, never skipped in CI. */
function databaseTest() {
  if (hasDatabase || inCi) return {};
  return { skip: "no test database (set MYSQL_*)" };
}

/** A fake interaction, enough for the permission check and the commands. */
function fakeInteraction({ userId = "300000000000000003", inGuild = true, manageServer = false, roles = [] } = {}) {
  return {
    user: { id: userId },
    inGuild: () => inGuild,
    member: inGuild ? { roles: { cache: new Map(roles.map(id => [id, { id }])) } } : null,
    memberPermissions: inGuild ? { has: () => manageServer } : null
  };
}

module.exports = { hasDatabase, inCi, databaseTest, fakeInteraction, OWNER, STAFF_GUILD };
