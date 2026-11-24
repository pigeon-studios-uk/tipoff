/**
 * /setup check: every permission Tipoff needs in every channel it posts to, the forum status tags, and the
 * urgent role. Checking only View and Send when saving would let reports with evidence fail later, and forums that
 * require tags never work.
 */

const { PermissionFlagsBits: P, ChannelType } = require("discord.js");
const forumTags = require("./forumTags");
const settingsStore = require("./settings");
const strings = require("../strings");
const en = require("../strings/en");

const FORUMS = new Set([ChannelType.GuildForum, ChannelType.GuildMedia]);
const THREADS = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

/** The permissions Tipoff needs to post a card in this kind of channel. */
function neededFor(channel) {
  const base = ["ViewChannel", "EmbedLinks", "AttachFiles", "ReadMessageHistory"];
  if (FORUMS.has(channel.type)) return [...base, "SendMessages", "SendMessagesInThreads"];
  if (THREADS.has(channel.type)) return [...base, "SendMessagesInThreads"];
  return [...base, "SendMessages"];
}

/** The permissions from `needed` that Tipoff doesn't have in `channel`. */
function missingIn(channel, me, needed = neededFor(channel)) {
  const perms = channel.permissionsFor?.(me);
  return needed.filter(name => !perms?.has(P[name]));
}

/**
 * Runs every check. Resolves to [problem text] (empty = all good), in the language of whoever asked (strings); the
 * forum tags it names are in the server's language, since that's what Tipoff makes them in. guild is discord.js's
 * Guild; fetchChannel lets threads that aren't cached be found.
 */
async function run(guild, settings, { fetchChannel = id => guild.channels.fetch(String(id)).catch(() => null), ensureTags = forumTags.ensure, strings: t = en } = {}) {
  const problems = [];
  const p = t.setup.problems;
  const server = strings.forServer(settings, guild);
  const me = guild.members.me;
  if (!settings.reportChannelId) return [p.noChannel];

  const list = [
    ["report", settings.reportChannelId],
    ["user", settings.userReportChannelId],
    ["escalation", settings.escalationChannelId]
  ].filter(([, id]) => id);

  for (const [key, id] of list) {
    const what = t.setup.channelNames[key];
    const channel = guild.channels.cache.get(String(id)) || await fetchChannel(id);
    if (!channel) {
      problems.push(p.missingChannel(what, id));
      continue;
    }
    const missing = missingIn(channel, me);
    if (missing.length) problems.push(p.missingPerms(`<#${id}>`, missing.map(name => t.setup.perms[name] || name).join(", ")));
    if (FORUMS.has(channel.type) && !missing.length) {
      try {
        const result = await ensureTags(channel, guild.id, { strings: server });
        if (result.missing.length) problems.push(p.noTags(`<#${id}>`, result.missing.join(", ")));
      } catch {
        problems.push(p.noTags(`<#${id}>`, forumTags.STATUSES.map(status => forumTags.tagName(status, server)).join(", ")));
      }
    }
  }

  if (settings.urgentRoleId) {
    const role = guild.roles.cache.get(String(settings.urgentRoleId));
    if (!role) problems.push(p.urgentRoleGone);
    else if (!role.mentionable && !me.permissions.has(P.MentionEveryone)) problems.push(p.urgentNotMentionable(`<@&${role.id}>`));
  }
  return problems;
}

/** The server's language as shown in /setup: its name, and whether it's chosen or the server's Discord language. */
function languageName(settings, guild, t = en) {
  const name = strings.forServer(settings, guild).language.name;
  return settings.language && strings.supported(settings.language) ? name : t.setup.languageAuto(name);
}

/** The settings as readable lines, for /setup replies, in the language of whoever asked (strings). */
function summary(settings, { strings: t = en, guild = null } = {}) {
  const none = t.setup.notNeeded.replace(/^-# /, "");
  const channel = id => (id ? `<#${id}>` : none);
  const roles = list => (list.length ? list.map(id => `<@&${id}>`).join(" ") : none);
  return t.setup.summary({
    report: channel(settings.reportChannelId),
    user: settings.userReportChannelId ? channel(settings.userReportChannelId) : channel(settings.reportChannelId),
    escalation: settings.escalationChannelId ? channel(settings.escalationChannelId) : channel(settings.reportChannelId),
    urgentRole: settings.urgentRoleId ? `<@&${settings.urgentRoleId}>` : none,
    moderators: roles(settings.moderatorRoleIds),
    staff: roles(settings.staffRoleIds),
    anonymous: settings.anonymous,
    reasons: settingsStore.reasonsFor(settings, strings.forServer(settings, guild)).join(", "),
    language: languageName(settings, guild, t),
    reporterCooldown: settings.reporterCooldownMinutes,
    maxOpen: settings.maxOpenReports,
    urgentCooldown: settings.urgentCooldownMinutes,
    outcomeDms: settings.outcomeDms,
    closePosts: settings.closeForumPosts,
    retention: settings.retentionDays
  });
}

module.exports = { neededFor, missingIn, run, summary, languageName, FORUMS, THREADS };
