/**
 * Status tags in forum report channels: Open, Claimed, Resolved, Dismissed and Urgent.
 *
 * The tag IDs are remembered in tp_forum_tags, and a saved ID that's still in the forum is always used first, whatever
 * the tag is called now: an admin can rename the tags, and changing the server's language never breaks a forum that
 * already has them. Names are only used to find tags Tipoff hasn't saved yet (in the server's language, or English),
 * and the missing ones are made, in the server's language, if Tipoff has Manage Channels there. Otherwise
 * /setup check lists them for an admin to add. Forums that require a tag on every post work once the tags exist,
 * because Tipoff always applies one.
 */

const { PermissionFlagsBits } = require("discord.js");
const sqlStore = require("./sqlStore");
const t = require("../strings/en");

const STATUSES = ["open", "claimed", "resolved", "dismissed", "urgent"];
const MAX_TAGS = 20; // Discord's limit per forum

/** The name Tipoff makes a status tag with, in the server's language (strings). */
const tagName = (status, s = t) => s.setup.tagNames[status];

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Which status tags a forum has by name: { status: tagId }. Matches the names in the server's language, then English,
 * without caring about case. known: tags already found ({ status: tagId }), which are kept and never matched again.
 */
function match(availableTags, { strings: s = t, known = {} } = {}) {
  const found = { ...known };
  const taken = new Set(Object.values(found).map(String));
  for (const status of STATUSES) {
    if (found[status]) continue;
    const free = (availableTags || []).filter(x => !taken.has(String(x.id)));
    const tag = free.find(x => same(x.name, tagName(status, s))) || free.find(x => same(x.name, tagName(status)));
    if (tag) {
      found[status] = String(tag.id);
      taken.add(String(tag.id));
    }
  }
  return found;
}

/** The saved tag IDs that are still in the forum: { status: tagId }. */
async function savedTags(forum, query) {
  const present = new Set((forum.availableTags || []).map(x => String(x.id)));
  const rows = await query("SELECT status, tag_id FROM tp_forum_tags WHERE channel_id = ?", [forum.id]);
  const out = {};
  for (const row of rows || []) if (STATUSES.includes(row.status) && present.has(String(row.tag_id))) out[row.status] = String(row.tag_id);
  return out;
}

/**
 * Makes sure a forum has the status tags. Resolves to { tags: { status: id }, missing: [names] }. Creates missing tags,
 * named in the server's language (strings), only if Tipoff has Manage Channels in that forum and there's room.
 */
async function ensure(forum, guildId, { query = sqlStore.query, strings: s = t } = {}) {
  const known = await savedTags(forum, query);
  let tags = match(forum.availableTags, { strings: s, known });
  let missing = STATUSES.filter(status => !tags[status]);
  const me = forum.guild?.members?.me;
  const canManage = Boolean(me && forum.permissionsFor?.(me)?.has(PermissionFlagsBits.ManageChannels));
  if (missing.length && canManage && (forum.availableTags || []).length + missing.length <= MAX_TAGS) {
    const updated = await forum.setAvailableTags([
      ...(forum.availableTags || []).map(x => ({ id: x.id, name: x.name, moderated: x.moderated, emoji: x.emoji })),
      ...missing.map(status => ({ name: tagName(status, s), moderated: true }))
    ]);
    tags = match(updated.availableTags, { strings: s, known: tags });
    missing = STATUSES.filter(status => !tags[status]);
  }
  for (const [status, tagId] of Object.entries(tags)) {
    if (known[status] === tagId) continue;
    await query(
      `INSERT INTO tp_forum_tags (guild_id, channel_id, status, tag_id) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tag_id = VALUES(tag_id)`,
      [guildId, forum.id, status, tagId]
    );
  }
  return { tags, missing: missing.map(status => tagName(status, s)) };
}

/** The tags a case's post should have: its status, plus Urgent while it's urgent and still open. */
function tagsFor(caseRow, tags) {
  const out = [];
  if (tags[caseRow.status]) out.push(tags[caseRow.status]);
  if (Number(caseRow.urgent) && (caseRow.status === "open" || caseRow.status === "claimed") && tags.urgent) out.push(tags.urgent);
  return out;
}

module.exports = { STATUSES, tagName, match, ensure, tagsFor };
