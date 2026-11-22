/**
 * Status tags in forum report channels: Open, Claimed, Resolved, Dismissed and Urgent.
 *
 * Tipoff uses tags with those names if the forum already has them, and makes the missing ones if it has Manage
 * Channels there. Otherwise /setup check lists them for an admin to add. The tag IDs are remembered in tp_forum_tags.
 * Forums that require a tag on every post work once the tags exist, because Tipoff always applies one.
 */

const { PermissionFlagsBits } = require("discord.js");
const sqlStore = require("./sqlStore");
const t = require("../strings/en");

const STATUSES = ["open", "claimed", "resolved", "dismissed", "urgent"];
const MAX_TAGS = 20; // Discord's limit per forum

/** The names Tipoff looks for (and makes), from strings/en.js. */
const tagName = status => t.setup.tagNames[status];

/** Which status tags a forum has: { status: tagId }. Matches names without caring about case. */
function match(availableTags) {
  const found = {};
  for (const status of STATUSES) {
    const tag = (availableTags || []).find(x => String(x.name).trim().toLowerCase() === tagName(status).toLowerCase());
    if (tag) found[status] = String(tag.id);
  }
  return found;
}

/**
 * Makes sure a forum has the status tags. Resolves to { tags: { status: id }, missing: [names] }. Creates missing tags
 * only if Tipoff has Manage Channels in that forum and there's room.
 */
async function ensure(forum, guildId, { query = sqlStore.query } = {}) {
  let tags = match(forum.availableTags);
  let missing = STATUSES.filter(status => !tags[status]);
  const me = forum.guild?.members?.me;
  const canManage = Boolean(me && forum.permissionsFor?.(me)?.has(PermissionFlagsBits.ManageChannels));
  if (missing.length && canManage && (forum.availableTags || []).length + missing.length <= MAX_TAGS) {
    const updated = await forum.setAvailableTags([
      ...(forum.availableTags || []).map(x => ({ id: x.id, name: x.name, moderated: x.moderated, emoji: x.emoji })),
      ...missing.map(status => ({ name: tagName(status), moderated: true }))
    ]);
    tags = match(updated.availableTags);
    missing = STATUSES.filter(status => !tags[status]);
  }
  for (const [status, tagId] of Object.entries(tags)) {
    await query(
      `INSERT INTO tp_forum_tags (guild_id, channel_id, status, tag_id) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tag_id = VALUES(tag_id)`,
      [guildId, forum.id, status, tagId]
    );
  }
  return { tags, missing: missing.map(tagName) };
}

/** The tags a case's post should have: its status, plus Urgent while it's urgent and still open. */
function tagsFor(caseRow, tags) {
  const out = [];
  if (tags[caseRow.status]) out.push(tags[caseRow.status]);
  if (Number(caseRow.urgent) && (caseRow.status === "open" || caseRow.status === "claimed") && tags.urgent) out.push(tags.urgent);
  return out;
}

module.exports = { STATUSES, tagName, match, ensure, tagsFor };
