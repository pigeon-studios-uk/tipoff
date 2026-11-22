/**
 * Cases: opening one or joining the open one, status changes, and reading a case back.
 *
 * A report joins the open case about the same thing for as long as that case is open, not just for a few minutes.
 * "The same thing" is the case's open_key:
 *   message  m:<message ID>:<edit stamp>   an edited message is new evidence, so a new case that links back
 *   user     u:<user ID>                   profile changes don't make a new case
 *   general  (none)                        every /report is its own case
 *
 * Every report takes a lock on its server's row first (SELECT ... FOR UPDATE), so two reports arriving together are
 * handled one after the other and can't make two cases, and case numbers never repeat or skip.
 */

const sqlStore = require("./sqlStore");

const OPEN = ["open", "claimed"];
const CLOSED = ["resolved", "dismissed"];

function openKey({ kind, targetUserId, targetMessageId, editStamp = 0 }) {
  if (kind === "message") return `m:${targetMessageId}:${editStamp || 0}`;
  if (kind === "user") return `u:${targetUserId}`;
  return null;
}

/**
 * Saves a report: joins the open case for its target, or opens a new one. Runs in one transaction.
 *
 * report: { guildId, kind, reason, snapshot, targetUserId, targetChannelId, targetMessageId, editStamp, reporterId,
 *           anonymous, urgent, note, escalated }
 * Resolves to { caseId, number, joined, newReporter, becameUrgent }.
 */
async function submit(report, { transaction = sqlStore.transaction, now = new Date() } = {}) {
  const key = openKey(report);
  return transaction(async connection => {
    const q = async (sql, params) => (await connection.query(sql, params))[0];

    await q("INSERT INTO tp_guilds (guild_id, joined_at, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE guild_id = guild_id",
      [report.guildId, now, now]);
    const [guild] = await q("SELECT next_case_number FROM tp_guilds WHERE guild_id = ? FOR UPDATE", [report.guildId]);

    if (key) {
      const [existing] = await q("SELECT id, number, urgent FROM tp_cases WHERE guild_id = ? AND open_key = ? FOR UPDATE", [report.guildId, key]);
      if (existing) {
        const [already] = await q("SELECT id FROM tp_case_reports WHERE case_id = ? AND reporter_id = ?", [existing.id, report.reporterId]);
        await q(
          `INSERT INTO tp_case_reports (case_id, reporter_id, anonymous, urgent, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note), anonymous = VALUES(anonymous),
             urgent = GREATEST(urgent, VALUES(urgent)), updated_at = VALUES(updated_at)`,
          [existing.id, report.reporterId, report.anonymous ? 1 : 0, report.urgent ? 1 : 0, report.note || null, now, now]
        );
        const becameUrgent = Boolean(report.urgent) && !Number(existing.urgent);
        await q("UPDATE tp_cases SET urgent = GREATEST(urgent, ?), escalated = GREATEST(escalated, ?), updated_at = ? WHERE id = ?",
          [report.urgent ? 1 : 0, report.escalated ? 1 : 0, now, existing.id]);
        await q("INSERT INTO tp_case_events (case_id, actor_id, action, created_at) VALUES (?, ?, 'joined', ?)", [existing.id, report.reporterId, now]);
        return { caseId: Number(existing.id), number: Number(existing.number), joined: true, newReporter: !already, becameUrgent };
      }
    }

    const number = Number(guild.next_case_number);
    await q("UPDATE tp_guilds SET next_case_number = next_case_number + 1 WHERE guild_id = ?", [report.guildId]);

    // the last closed case about the same message or member, to link back to ("Earlier: #98, resolved")
    let linked = null;
    if (report.kind === "message" || report.kind === "user") {
      const [previous] = await q(
        report.kind === "message"
          ? "SELECT id FROM tp_cases WHERE guild_id = ? AND kind = 'message' AND target_message_id = ? ORDER BY id DESC LIMIT 1"
          : "SELECT id FROM tp_cases WHERE guild_id = ? AND kind = 'user' AND target_user_id = ? AND status IN ('resolved','dismissed') ORDER BY id DESC LIMIT 1",
        [report.guildId, report.kind === "message" ? report.targetMessageId : report.targetUserId]
      );
      linked = previous ? previous.id : null;
    }

    const result = await q(
      `INSERT INTO tp_cases (guild_id, number, kind, reason, status, target_user_id, target_channel_id, target_message_id, edit_stamp,
        open_key, urgent, escalated, linked_case_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [report.guildId, number, report.kind, report.reason, report.targetUserId || null, report.targetChannelId || null,
        report.targetMessageId || null, report.editStamp || 0, key, report.urgent ? 1 : 0, report.escalated ? 1 : 0, linked, now, now]
    );
    const caseId = Number(result.insertId);
    await q("INSERT INTO tp_case_evidence (case_id, data) VALUES (?, ?)", [caseId, JSON.stringify(report.snapshot || {})]);
    await q("INSERT INTO tp_case_reports (case_id, reporter_id, anonymous, urgent, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [caseId, report.reporterId, report.anonymous ? 1 : 0, report.urgent ? 1 : 0, report.note || null, now, now]);
    await q("INSERT INTO tp_case_events (case_id, actor_id, action, created_at) VALUES (?, ?, 'opened', ?)", [caseId, report.reporterId, now]);
    return { caseId, number, joined: false, newReporter: true, becameUrgent: Boolean(report.urgent) };
  });
}

// --- reading ---

async function byId(caseId, { query = sqlStore.query } = {}) {
  const [row] = await query("SELECT * FROM tp_cases WHERE id = ?", [caseId]);
  return row || null;
}

async function byNumber(guildId, number, { query = sqlStore.query } = {}) {
  const [row] = await query("SELECT * FROM tp_cases WHERE guild_id = ? AND number = ?", [guildId, number]);
  return row || null;
}

async function evidence(caseId, { query = sqlStore.query } = {}) {
  const [row] = await query("SELECT data FROM tp_case_evidence WHERE case_id = ?", [caseId]);
  try {
    return row ? JSON.parse(row.data) : {};
  } catch {
    return {};
  }
}

async function saveEvidence(caseId, data, { query = sqlStore.query } = {}) {
  await query("UPDATE tp_case_evidence SET data = ? WHERE case_id = ?", [JSON.stringify(data), caseId]);
}

async function reporters(caseId, { query = sqlStore.query } = {}) {
  return query("SELECT reporter_id, anonymous, urgent, note, created_at, updated_at FROM tp_case_reports WHERE case_id = ? ORDER BY created_at, id", [caseId]);
}

async function events(caseId, { query = sqlStore.query } = {}) {
  return query("SELECT actor_id, action, detail, created_at FROM tp_case_events WHERE case_id = ? ORDER BY created_at, id", [caseId]);
}

/** Earlier cases about a member: { total, resolved, dismissed }. */
async function history(guildId, userId, exceptCaseId, { query = sqlStore.query } = {}) {
  if (!userId) return { total: 0, resolved: 0, dismissed: 0 };
  const [row] = await query(
    `SELECT COUNT(*) AS total, SUM(status = 'resolved') AS resolved, SUM(status = 'dismissed') AS dismissed
     FROM tp_cases WHERE guild_id = ? AND target_user_id = ? AND id <> ?`,
    [guildId, userId, exceptCaseId || 0]
  );
  return { total: Number(row?.total || 0), resolved: Number(row?.resolved || 0), dismissed: Number(row?.dismissed || 0) };
}

// --- changing ---

async function addEvent(caseId, actorId, action, detail = null, { query = sqlStore.query, now = new Date() } = {}) {
  await query("INSERT INTO tp_case_events (case_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    [caseId, actorId || null, action, detail ? String(detail).slice(0, 1000) : null, now]);
}

/**
 * Changes a case's status. Each change only happens from the statuses it makes sense from, checked in the UPDATE itself
 * so two moderators pressing buttons at once can't both win. Resolves true if it changed, false if the case was
 * already past that point.
 *
 *   claim     open -> claimed          unclaim   claimed -> open
 *   resolve   open/claimed -> resolved dismiss   open/claimed -> dismissed
 *   reopen    resolved/dismissed -> open (joins reports again unless a newer case about the same thing is open)
 */
async function changeStatus(caseId, action, actorId, { note = null, transaction = sqlStore.transaction, now = new Date() } = {}) {
  return transaction(async connection => {
    const q = async (sql, params) => (await connection.query(sql, params))[0];
    const [row] = await q("SELECT * FROM tp_cases WHERE id = ? FOR UPDATE", [caseId]);
    if (!row) return false;
    let result;
    if (action === "claim") {
      result = await q("UPDATE tp_cases SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'open'", [actorId, now, now, caseId]);
    } else if (action === "unclaim") {
      result = await q("UPDATE tp_cases SET status = 'open', claimed_by = NULL, claimed_at = NULL, updated_at = ? WHERE id = ? AND status = 'claimed'", [now, caseId]);
    } else if (action === "resolve" || action === "dismiss") {
      result = await q(
        `UPDATE tp_cases SET status = ?, open_key = NULL, closed_by = ?, closed_at = ?, close_note = ?, updated_at = ?
         WHERE id = ? AND status IN ('open','claimed')`,
        [action === "resolve" ? "resolved" : "dismissed", actorId, now, note ? String(note).slice(0, 1000) : null, now, caseId]
      );
    } else if (action === "reopen") {
      const key = openKey({ kind: row.kind, targetUserId: row.target_user_id, targetMessageId: row.target_message_id, editStamp: row.edit_stamp });
      let free = Boolean(key);
      if (key) {
        const [other] = await q("SELECT id FROM tp_cases WHERE guild_id = ? AND open_key = ? AND id <> ?", [row.guild_id, key, caseId]);
        free = !other;
      }
      result = await q(
        `UPDATE tp_cases SET status = 'open', open_key = ?, claimed_by = NULL, claimed_at = NULL, closed_by = NULL, closed_at = NULL,
          close_note = NULL, updated_at = ? WHERE id = ? AND status IN ('resolved','dismissed')`,
        [free ? key : null, now, caseId]
      );
    } else {
      throw new Error(`Unknown case action ${action}`);
    }
    if (Number(result.affectedRows) !== 1) return false;
    const eventName = { claim: "claimed", unclaim: "unclaimed", resolve: "resolved", dismiss: "dismissed", reopen: "reopened" }[action];
    await q("INSERT INTO tp_case_events (case_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      [caseId, actorId, eventName, note ? String(note).slice(0, 1000) : null, now]);
    return true;
  });
}

async function setCard(caseId, channelId, messageId, { delivered = true, query = sqlStore.query, now = new Date() } = {}) {
  await query("UPDATE tp_cases SET card_channel_id = ?, card_message_id = ?, delivered = ?, updated_at = ? WHERE id = ?",
    [channelId, messageId, delivered ? 1 : 0, now, caseId]);
}

async function markUndelivered(caseId, { query = sqlStore.query } = {}) {
  await query("UPDATE tp_cases SET delivered = 0 WHERE id = ?", [caseId]);
}

async function undelivered(guildId, { query = sqlStore.query, limit = 25 } = {}) {
  return query("SELECT id FROM tp_cases WHERE guild_id = ? AND delivered = 0 ORDER BY id LIMIT ?", [guildId, limit]);
}

module.exports = {
  OPEN, CLOSED, openKey, submit, byId, byNumber, evidence, saveEvidence, reporters, events, history, addEvent,
  changeStatus, setCard, markUndelivered, undelivered
};
