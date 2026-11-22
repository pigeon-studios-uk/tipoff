// The rest of a server's settings, abuse limits, report drafts and the audit log.
//
//   tp_forum_tags     the status tags in each forum Tipoff posts cases to
//   tp_guild_roles    the server's moderator and staff roles (staff roles send reports to the escalation channel)
//   tp_guild_reasons  the reasons in the report forms (empty = the defaults in strings/en.js)
//   tp_blocks         members blocked from reporting in a server
//   tp_limits         the last report and last urgent ping per member, for cool-downs (pruned hourly)
//   tp_report_drafts  a report form's preview while it's open (Discord doesn't send the message back with the
//                     form), deleted when the form is sent and pruned after 30 minutes either way. A form stays open
//                     15 minutes, so a slow typist never loses what they wrote.
//   tp_audit          settings changes: who changed what in which server (kept a year)
//   tp_alerts         when a server's admins were last told reports are failing, so they're told once, not every time
module.exports = {
  statements: [
    // the status tags Tipoff made (or found) in each forum it posts cases to: status -> tag ID
    `CREATE TABLE IF NOT EXISTS tp_forum_tags (
      guild_id BIGINT UNSIGNED NOT NULL,
      channel_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(20) NOT NULL,
      tag_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (channel_id, status),
      KEY idx_tp_forum_tags_guild (guild_id)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_guild_roles (
      guild_id BIGINT UNSIGNED NOT NULL,
      role_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('moderator','staff') NOT NULL,
      PRIMARY KEY (guild_id, kind, role_id)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_guild_reasons (
      guild_id BIGINT UNSIGNED NOT NULL,
      position TINYINT UNSIGNED NOT NULL,
      label VARCHAR(100) NOT NULL,
      PRIMARY KEY (guild_id, position)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_blocks (
      guild_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      blocked_by BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(500) NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_limits (
      guild_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      last_report_at DATETIME(3) NULL,
      last_urgent_at DATETIME(3) NULL,
      PRIMARY KEY (guild_id, user_id),
      KEY idx_tp_limits_report (last_report_at)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_report_drafts (
      id CHAR(16) NOT NULL PRIMARY KEY,
      guild_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('message','user') NOT NULL,
      data LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY idx_tp_drafts_created (created_at)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id BIGINT UNSIGNED NOT NULL,
      actor_id BIGINT UNSIGNED NOT NULL,
      action VARCHAR(60) NOT NULL,
      detail LONGTEXT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY idx_tp_audit_guild (guild_id, created_at),
      KEY idx_tp_audit_created (created_at)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_alerts (
      guild_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(40) NOT NULL,
      last_sent_at DATETIME(3) NOT NULL,
      PRIMARY KEY (guild_id, kind)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  ]
};
