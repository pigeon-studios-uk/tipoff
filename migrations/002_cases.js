// Cases and everything in them.
//
//   tp_cases          one row per case: what it's about, its status, where its card is
//   tp_case_evidence  the snapshot taken when the case opened (message text, embeds, attachments...), as JSON
//   tp_case_reports   every report that opened or joined the case; one row per reporter (a second report from the
//                     same person updates their note)
//   tp_case_events    what happened to the case: claimed, resolved, timed out, card re-posted...
//
// open_key is the target's key while the case is open or claimed, and NULL once it's closed, so the unique index lets
// only one open case per target per server exist; closing it frees the key for the next case.
module.exports = {
  statements: [
    `CREATE TABLE IF NOT EXISTS tp_cases (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      guild_id BIGINT UNSIGNED NOT NULL,
      number INT UNSIGNED NOT NULL,
      kind ENUM('message','user','general') NOT NULL,
      reason VARCHAR(100) NOT NULL,
      status ENUM('open','claimed','resolved','dismissed') NOT NULL DEFAULT 'open',
      target_user_id BIGINT UNSIGNED NULL,
      target_channel_id BIGINT UNSIGNED NULL,
      target_message_id BIGINT UNSIGNED NULL,
      edit_stamp BIGINT UNSIGNED NOT NULL DEFAULT 0,
      open_key VARCHAR(80) NULL,
      urgent TINYINT(1) NOT NULL DEFAULT 0,
      escalated TINYINT(1) NOT NULL DEFAULT 0,
      linked_case_id BIGINT UNSIGNED NULL,
      claimed_by BIGINT UNSIGNED NULL,
      claimed_at DATETIME(3) NULL,
      closed_by BIGINT UNSIGNED NULL,
      closed_at DATETIME(3) NULL,
      close_note VARCHAR(1000) NULL,
      card_channel_id BIGINT UNSIGNED NULL,
      card_message_id BIGINT UNSIGNED NULL,
      delivered TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_tp_cases_number (guild_id, number),
      UNIQUE KEY uq_tp_cases_open (guild_id, open_key),
      KEY idx_tp_cases_status (guild_id, status),
      KEY idx_tp_cases_target (guild_id, target_user_id),
      KEY idx_tp_cases_created (guild_id, created_at),
      KEY idx_tp_cases_closed (closed_at),
      KEY idx_tp_cases_undelivered (guild_id, delivered)
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_case_evidence (
      case_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      data LONGTEXT NOT NULL,
      CONSTRAINT fk_tp_evidence_case FOREIGN KEY (case_id) REFERENCES tp_cases (id) ON DELETE CASCADE
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_case_reports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      case_id BIGINT UNSIGNED NOT NULL,
      reporter_id BIGINT UNSIGNED NOT NULL,
      anonymous TINYINT(1) NOT NULL DEFAULT 0,
      urgent TINYINT(1) NOT NULL DEFAULT 0,
      note VARCHAR(2000) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_tp_reports_reporter (case_id, reporter_id),
      KEY idx_tp_reports_reporter (reporter_id),
      CONSTRAINT fk_tp_reports_case FOREIGN KEY (case_id) REFERENCES tp_cases (id) ON DELETE CASCADE
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS tp_case_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      case_id BIGINT UNSIGNED NOT NULL,
      actor_id BIGINT UNSIGNED NULL,
      action VARCHAR(40) NOT NULL,
      detail VARCHAR(1000) NULL,
      created_at DATETIME(3) NOT NULL,
      KEY idx_tp_events_case (case_id, created_at),
      CONSTRAINT fk_tp_events_case FOREIGN KEY (case_id) REFERENCES tp_cases (id) ON DELETE CASCADE
    ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  ]
};
