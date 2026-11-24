/**
 * Posting and updating case cards.
 *
 *   deliver(client, caseId)   posts the card, or edits it if it's already posted; re-posts it from the saved copy if
 *                             the card was deleted; if Tipoff can't post, the case is kept as "waiting", the admins
 *                             are told once, and /setup check posts it once fixed
 *   pingUrgent(...)           an existing card just became urgent: one reply pinging the urgent role
 *   redeliver(client, guild)  posts every waiting case (from /setup check)
 *
 * Where a card goes: reports about staff to the escalation channel (if set), member reports to the member reports
 * channel (if set), everything else to the report channel. A forum gets one post per case, tagged by status.
 * Everything posted is in the server's language (strings/index.js, serverLocale).
 */

const { PermissionFlagsBits, ChannelType, DiscordAPIError } = require("discord.js");
const logger = require("./logger");
const cases = require("./cases");
const cards = require("./cards");
const settingsStore = require("./settings");
const forumTags = require("./forumTags");
const alerts = require("./alerts");
const evidenceTools = require("./evidence");
const strings = require("../strings");

const FORUMS = new Set([ChannelType.GuildForum, ChannelType.GuildMedia]);
const GONE = new Set([10003, 10008]);            // Unknown Channel, Unknown Message
const NO_ACCESS = new Set([50001, 50013]);       // Missing Access, Missing Permissions
const ARCHIVED = 50083;                          // Thread is archived

/** Which channel a case's card belongs in, and which setting that is (a key of setup.channelNames, for alerts). */
function destination(c, settings) {
  if (Number(c.escalated) && settings.escalationChannelId) return { channelId: settings.escalationChannelId, what: "escalation" };
  if (c.kind === "user" && settings.userReportChannelId) return { channelId: settings.userReportChannelId, what: "user" };
  return { channelId: settings.reportChannelId, what: "report" };
}

/** What Tipoff may do in this server, for the Actions menu. */
function botCan(guild, c) {
  const me = guild?.members?.me;
  if (!me) return {};
  const target = c.target_channel_id ? guild.channels.cache.get(String(c.target_channel_id)) : null;
  const P = PermissionFlagsBits;
  return {
    delete: Boolean(target ? target.permissionsFor(me)?.has(P.ManageMessages) : me.permissions.has(P.ManageMessages)),
    timeout: me.permissions.has(P.ModerateMembers),
    kick: me.permissions.has(P.KickMembers),
    ban: me.permissions.has(P.BanMembers)
  };
}

/** Everything the card needs, read fresh. */
async function view(client, caseId, extra = {}) {
  const c = await cases.byId(caseId);
  if (!c) return null;
  const [ev, reps, settings] = await Promise.all([cases.evidence(caseId), cases.reporters(caseId), settingsStore.get(c.guild_id)]);
  const hist = c.target_user_id ? await cases.history(c.guild_id, c.target_user_id, c.id) : null;
  const linkedRow = c.linked_case_id ? await cases.byId(c.linked_case_id) : null;
  const guild = client.guilds.cache.get(String(c.guild_id));
  return {
    c, ev, reps, settings, hist, guild, strings: strings.forServer(settings, guild),
    linked: linkedRow ? { number: linkedRow.number, status: linkedRow.status } : null, botCan: botCan(guild, c), ...extra
  };
}

/** The problem for a Discord error, as a key of alerts.problems ("gone", "noAccess"), or null if it isn't a "can't post here" error. */
function problemFor(err) {
  const code = err instanceof DiscordAPIError || typeof err?.code === "number" ? err.code : null;
  if (GONE.has(code)) return "gone";
  if (NO_ACCESS.has(code)) return "noAccess";
  return null;
}

async function fetchChannel(client, id) {
  try {
    return await client.channels.fetch(String(id));
  } catch (err) {
    if (GONE.has(err.code) || NO_ACCESS.has(err.code)) return null;
    throw err;
  }
}

/** Copies the attachments that fit onto the card (first post or re-post), and remembers which are on it. */
async function prepareFiles(caseId, ev) {
  if (!(ev.attachments || []).length) return [];
  for (const a of ev.attachments) delete a.copiedAs;
  const plan = evidenceTools.planAttachments(ev.attachments, ev.uploadLimit);
  const { files } = await evidenceTools.download(plan);
  await cases.saveEvidence(caseId, ev);
  return files;
}

/** Posts or edits a case's card. Resolves to { delivered, problem? }. */
async function deliver(client, caseId, { ping = false } = {}) {
  const v = await view(client, caseId, { ping });
  if (!v) return { delivered: false, problem: "missing case" };
  const { c, settings } = v;

  // already posted: edit it where it is
  if (c.card_channel_id && c.card_message_id) {
    try {
      const channel = await fetchChannel(client, c.card_channel_id);
      if (channel) {
        await editCard(channel, c, v);
        await syncForumPost(channel, c, settings, v.strings);
        if (!Number(c.delivered)) await cases.setCard(c.id, c.card_channel_id, c.card_message_id);
        return { delivered: true };
      }
    } catch (err) {
      if (!GONE.has(err.code)) throw err;
    }
    // the card (or its post) was deleted: post it again from the saved copy
    await cases.addEvent(c.id, null, "reposted");
    v.reposted = true;
  }

  const { channelId, what } = destination(c, settings);
  if (!channelId) return { delivered: false, problem: "not set up" };
  try {
    const channel = await fetchChannel(client, channelId);
    if (!channel) throw Object.assign(new Error("channel gone"), { code: 10003 });
    const files = await prepareFiles(c.id, v.ev);
    const body = cards.render(v);
    let posted;
    if (FORUMS.has(channel.type)) {
      const { tags } = await forumTags.ensure(channel, c.guild_id, { strings: v.strings });
      const thread = await channel.threads.create({ name: cards.threadName(c, v.ev, v.strings), message: { ...body, files }, appliedTags: forumTags.tagsFor(c, tags) });
      posted = { channelId: thread.id, messageId: thread.id };
    } else {
      const message = await channel.send({ ...body, files });
      posted = { channelId: channel.id, messageId: message.id };
    }
    await cases.setCard(c.id, posted.channelId, posted.messageId);
    if (!Number(c.delivered)) await cases.addEvent(c.id, null, "delivered");
    await alerts.clear(c.guild_id, "delivery");
    return { delivered: true };
  } catch (err) {
    const problem = problemFor(err);
    if (!problem) throw err;
    await cases.markUndelivered(c.id);
    logger.warn(`Case ${c.id} in server ${c.guild_id} is waiting: ${strings.t().alerts.problems[problem]}`);
    await alerts.failing(client, c.guild_id, settings, what, problem).catch(e => logger.warn(`Alert failed: ${e.message}`));
    return { delivered: false, problem };
  }
}

async function editCard(channel, c, v) {
  const body = cards.render(v);
  const edit = () => channel.messages.edit(String(c.card_message_id), { components: body.components, flags: body.flags, allowedMentions: body.allowedMentions });
  try {
    await edit();
  } catch (err) {
    if (err.code !== ARCHIVED || !channel.setArchived) throw err;
    await channel.setArchived(false);
    await edit();
  }
}

/** Keeps a forum post's tags in step with the case, and closes the post when the case closes (a setting). */
async function syncForumPost(channel, c, settings, s) {
  if (!channel.isThread?.() || !FORUMS.has(channel.parent?.type)) return;
  try {
    const { tags } = await forumTags.ensure(channel.parent, c.guild_id, { strings: s });
    const wanted = forumTags.tagsFor(c, tags);
    const kept = (channel.appliedTags || []).filter(id => !Object.values(tags).includes(String(id)));
    const next = [...new Set([...kept, ...wanted])].slice(0, 5);
    if (next.join() !== (channel.appliedTags || []).join()) await channel.setAppliedTags(next);
    const closed = c.status === "resolved" || c.status === "dismissed";
    if (closed && settings.closeForumPosts && !channel.archived) await channel.setArchived(true);
    if (!closed && channel.archived) await channel.setArchived(false);
  } catch (err) {
    logger.warn(`Couldn't update the forum post for case ${c.id}: ${err.message}`);
  }
}

/** An existing card just became urgent: one reply pinging the urgent role (edits never ping). */
async function pingUrgent(client, caseId) {
  const c = await cases.byId(caseId);
  if (!c?.card_channel_id || !c.card_message_id) return false;
  const settings = await settingsStore.get(c.guild_id);
  if (!settings.urgentRoleId) return false;
  try {
    const channel = await fetchChannel(client, c.card_channel_id);
    if (!channel) return false;
    await channel.send({
      content: strings.forServer(settings, client.guilds.cache.get(String(c.guild_id))).card.urgent(`<@&${settings.urgentRoleId}>`) + ` · #${c.number}`,
      reply: { messageReference: String(c.card_message_id), failIfNotExists: false },
      allowedMentions: { parse: [], roles: [settings.urgentRoleId] }
    });
    return true;
  } catch (err) {
    logger.warn(`Couldn't ping the urgent role for case ${c.id}: ${err.message}`);
    return false;
  }
}

/** Posts the cases still waiting in a server. Resolves to { posted, waiting }. */
async function redeliver(client, guildId) {
  const waiting = await cases.undelivered(guildId);
  let posted = 0;
  for (const row of waiting) {
    const result = await deliver(client, row.id);
    if (!result.delivered) break; // same problem for the rest; don't alert again
    posted++;
  }
  const left = (await cases.undelivered(guildId)).length;
  return { posted, waiting: left };
}

module.exports = { destination, botCan, view, deliver, pingUrgent, redeliver, problemFor, FORUMS };
