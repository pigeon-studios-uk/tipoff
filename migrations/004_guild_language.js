// The language Tipoff posts in, for each server (/setup language): case cards, forum post names and status tags,
// alerts. A Discord locale such as "de" or "pt-BR"; NULL means the server's own Discord language, or English.
//
// One statement, so running it again after a failure can't half-apply it (MySQL has no ADD COLUMN IF NOT EXISTS).
module.exports = {
  statements: [
    "ALTER TABLE tp_guilds ADD COLUMN language VARCHAR(10) NULL AFTER retention_days"
  ]
};
