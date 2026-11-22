// Every server Tipoff is in, with its settings. One row per server, made when Tipoff joins.
//
// left_at is set when Tipoff is removed (not when a server is only unavailable during a Discord outage), and the
// retention job deletes the server's data 30 days after it. If Tipoff is added back
// within the 30 days, left_at is cleared and everything is as it was.
//
// The channel and role settings are filled in by /setup (phase 1). Defaults match the plan's settings table.
module.exports = {
  statements: [
    `CREATE TABLE IF NOT EXISTS tp_guilds (
      guild_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      joined_at DATETIME(3) NOT NULL,
      left_at DATETIME(3) NULL,
      next_case_number INT UNSIGNED NOT NULL DEFAULT 1,

      report_channel_id BIGINT UNSIGNED NULL,
      user_report_channel_id BIGINT UNSIGNED NULL,
      escalation_channel_id BIGINT UNSIGNED NULL,
      urgent_role_id BIGINT UNSIGNED NULL,

      urgent_cooldown_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
      anonymous_enabled TINYINT(1) NOT NULL DEFAULT 0,
      reporter_cooldown_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 2,
      max_open_reports SMALLINT UNSIGNED NOT NULL DEFAULT 5,
      outcome_dms TINYINT(1) NOT NULL DEFAULT 0,
      close_forum_posts TINYINT(1) NOT NULL DEFAULT 1,
      retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 90,

      updated_at DATETIME(3) NOT NULL,
      KEY idx_tp_guilds_left (left_at)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  ]
};
