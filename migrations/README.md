# Migrations

Every table Tipoff has is made and changed here, by numbered files that run on start ([services/migrations.js](../services/migrations.js)).

## Adding one

1. Make the next number, for example `002_cases.js`. Numbers start at `001`, with no gaps or repeats.
2. Export the statements, one change each:

   ```js
   module.exports = {
     statements: [
       `CREATE TABLE IF NOT EXISTS tp_cases (
         ...
       ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
     ]
   };
   ```

3. Write it so running it again is safe. MySQL can't roll back `CREATE` or `ALTER`, and a migration that fails part way isn't recorded, so the next start runs the whole file again.

## Rules

- **Never edit a migration that has run anywhere.** Its checksum is recorded, and Tipoff refuses to start if the file changes. Make the change in a new migration.
- Every table starts with `tp_`, uses InnoDB and `utf8mb4_unicode_ci`.
- Discord IDs are `BIGINT UNSIGNED` (read back as strings, so no digits are lost).
- Every server's records carry its `guild_id`, and every query filters by it.
- Dates are `DATETIME(3)` in UTC.
- What each table keeps, and for how long, is in the plan (5.2). Retention jobs delete on time; nothing is kept "just in case".
