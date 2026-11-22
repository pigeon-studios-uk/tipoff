/**
 * Moderator actions from the case card: delete the message, time out, kick, ban.
 *
 * Every action is checked against the person pressing it AND against Tipoff, so Tipoff never lets someone do through
 * it what they couldn't do themselves:
 *   - the moderator has the Discord permission for it (Manage Messages in that channel, Timeout, Kick, Ban Members)
 *   - their highest role is above the target's (the server owner is above everyone; nobody can act on the owner)
 *   - Tipoff has the permission, and its highest role is above the target's
 * Each action is written on the case and in Discord's audit log reason ("Tipoff case #142, by @mod: spam").
 */

const { PermissionFlagsBits: P } = require("discord.js");
const cases = require("./cases");
const t = require("../strings/en");

const NEEDS = {
  delete: { flag: P.ManageMessages, name: "ManageMessages" },
  timeout: { flag: P.ModerateMembers, name: "ModerateMembers" },
  kick: { flag: P.KickMembers, name: "KickMembers" },
  ban: { flag: P.BanMembers, name: "BanMembers" }
};
const TIMEOUTS = { 600: 600, 3600: 3600, 86400: 86400, 604800: 604800 };

class ActionRefused extends Error {
  constructor(userMessage) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

const permName = key => t.setup.perms[key] || key;
const highest = member => member?.roles?.highest?.position ?? 0;

/**
 * Decides whether this moderator may do `action` on this case, without doing it. Resolves to { member } (the target
 * member, for timeout/kick) or throws ActionRefused. deps lets tests pass fakes.
 */
async function check(interaction, action, c, { fetchMember = id => interaction.guild.members.fetch(String(id)) } = {}) {
  const need = NEEDS[action];
  if (!need) throw new ActionRefused(t.errors.notAllowed);
  const guild = interaction.guild;
  const actor = interaction.member;
  const me = guild.members.me;
  const r = t.caseActions.refused;

  if (action === "delete") {
    const channel = guild.channels.cache.get(String(c.target_channel_id)) || await guild.channels.fetch(String(c.target_channel_id)).catch(() => null);
    if (!channel) throw new ActionRefused(r.messageGone);
    if (!channel.permissionsFor(actor)?.has(need.flag)) throw new ActionRefused(r.youNeed(permName(need.name)));
    if (!channel.permissionsFor(me)?.has(need.flag)) throw new ActionRefused(r.tipoffNeeds(permName(need.name)));
    // deleting a staff member's message still needs the role check
    if (c.target_user_id) await hierarchy(guild, actor, me, c.target_user_id, fetchMember, { allowMissing: true });
    return { channel };
  }

  if (!interaction.memberPermissions?.has(need.flag)) throw new ActionRefused(r.youNeed(permName(need.name)));
  if (!me.permissions.has(need.flag)) throw new ActionRefused(r.tipoffNeeds(permName(need.name)));
  const member = await hierarchy(guild, actor, me, c.target_user_id, fetchMember, { allowMissing: action === "ban" });
  return { member };
}

async function hierarchy(guild, actor, me, targetId, fetchMember, { allowMissing = false } = {}) {
  const r = t.caseActions.refused;
  if (String(guild.ownerId) === String(targetId)) throw new ActionRefused(r.owner);
  let target = null;
  try {
    target = await fetchMember(targetId);
  } catch {
    target = null;
  }
  if (!target) {
    if (allowMissing) return null;
    throw new ActionRefused(r.notAMember);
  }
  const actorIsOwner = String(guild.ownerId) === String(actor.id || actor.user?.id);
  if (!actorIsOwner && highest(actor) <= highest(target)) throw new ActionRefused(r.higherRole);
  if (highest(me) <= highest(target)) throw new ActionRefused(r.tipoffLower);
  return target;
}

/**
 * Does the action, after check(). options: { duration (seconds, timeout), reason, deleteMessages (ban) }.
 * Resolves to the line to show the moderator. The case gets an event either way.
 */
async function run(interaction, action, c, checked, { duration, reason, deleteMessages = false } = {}) {
  const by = interaction.user.username;
  const auditReason = t.caseActions.auditReason(c.number, by, reason).slice(0, 512);
  const done = t.caseActions.done;
  const who = `<@${c.target_user_id}>`;
  let line;
  let detail = reason || null;

  if (action === "delete") {
    try {
      await checked.channel.messages.delete(String(c.target_message_id));
    } catch (err) {
      if (err.code === 10008) throw new ActionRefused(t.caseActions.refused.messageGone);
      throw err;
    }
    const ev = await cases.evidence(c.id);
    ev.deleted = true;
    await cases.saveEvidence(c.id, ev);
    line = done.deleted;
  } else if (action === "timeout") {
    const seconds = TIMEOUTS[duration] || 3600;
    await checked.member.timeout(seconds * 1000, auditReason);
    line = done.timedOut(who, t.caseActions.durations[String(seconds)]);
    detail = `${t.caseActions.durations[String(seconds)]}${reason ? `: ${reason}` : ""}`;
  } else if (action === "kick") {
    await checked.member.kick(auditReason);
    line = done.kicked(who);
  } else if (action === "ban") {
    await interaction.guild.members.ban(String(c.target_user_id), { reason: auditReason, deleteMessageSeconds: deleteMessages ? 86400 : 0 });
    line = done.banned(who);
  }
  await cases.addEvent(c.id, interaction.user.id, action, detail);
  return line;
}

module.exports = { NEEDS, TIMEOUTS, ActionRefused, check, run, hierarchy };
