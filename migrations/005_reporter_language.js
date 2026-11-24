// The Discord language each reporter used when they reported, so the outcome DM is in their language. NULL (reports
// from before this) means English.
//
// One statement, so running it again after a failure can't half-apply it (MySQL has no ADD COLUMN IF NOT EXISTS).
module.exports = {
  statements: [
    "ALTER TABLE tp_case_reports ADD COLUMN locale VARCHAR(10) NULL AFTER note"
  ]
};
