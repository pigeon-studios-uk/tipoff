/**
 * Just enough of Discord for delivery and actions tests: a client with channels (text and forum), a guild with
 * Tipoff's own member and permissions, and a log of everything "sent". No network.
 */

const { PermissionFlagsBits, ChannelType } = require("discord.js");

let nextId = 900000000000000000n;
const id = () => String(nextId++);

function discordError(code) {
  return Object.assign(new Error(`Discord error ${code}`), { code });
}

function permissionSet(flags) {
  const bits = flags.reduce((all, flag) => all | flag, 0n);
  return { has: wanted => (Array.isArray(wanted) ? wanted : [wanted]).every(flag => (bits & flag) === flag) };
}

const ALL = Object.values(PermissionFlagsBits);

function fakeGuild({ guildId = "500000000000000005", ownerId = "100000000000000099", botPerms = ALL, botRole = 10 } = {}) {
  const channels = new Map();
  const log = { sent: [], edited: [], dms: [], threads: [], tags: [] };
  const me = { id: "777000000000000777", permissions: permissionSet(botPerms), roles: { highest: { position: botRole } } };
  const guild = {
    id: guildId, ownerId, name: "Test Server",
    members: {
      me,
      fetch: async userId => guild._members.get(String(userId)) || Promise.reject(discordError(10007)),
      ban: async (userId, options) => { log.banned = { userId, options }; }
    },
    _members: new Map(),
    roles: { cache: new Map() },
    channels: { cache: channels, fetch: async channelId => channels.get(String(channelId)) || Promise.reject(discordError(10003)) },
    fetchOwner: async () => ({ send: async body => { log.dms.push(body); } })
  };
  return { guild, channels, log, me };
}

function textChannel(env, { channelId = id(), perms = ALL, failWith = null } = {}) {
  const messages = new Map();
  const channel = {
    id: channelId, type: ChannelType.GuildText, guild: env.guild,
    isTextBased: () => true, isThread: () => false,
    permissionsFor: () => permissionSet(perms),
    send: async body => {
      if (failWith) throw discordError(failWith);
      const message = { id: id(), body };
      messages.set(message.id, message);
      env.log.sent.push({ channelId, body });
      return message;
    },
    messages: {
      edit: async (messageId, body) => {
        if (!messages.has(String(messageId))) throw discordError(10008);
        messages.get(String(messageId)).body = body;
        env.log.edited.push({ channelId, messageId, body });
      },
      delete: async messageId => { env.log.deletedMessage = messageId; }
    },
    _messages: messages,
    fail(code) { failWith = code; }
  };
  env.channels.set(channelId, channel);
  return channel;
}

function forumChannel(env, { channelId = id(), perms = ALL, tags = [] } = {}) {
  const forum = {
    id: channelId, type: ChannelType.GuildForum, guild: env.guild, availableTags: tags,
    isTextBased: () => false, isThread: () => false,
    permissionsFor: () => permissionSet(perms),
    setAvailableTags: async list => {
      forum.availableTags = list.map(tag => ({ ...tag, id: tag.id || id() }));
      env.log.tags.push(forum.availableTags);
      return forum;
    },
    threads: {
      create: async ({ name, message, appliedTags }) => {
        const thread = textChannel(env, { channelId: id(), perms });
        Object.assign(thread, {
          type: ChannelType.PublicThread, name, appliedTags, archived: false, parent: forum,
          isThread: () => true,
          setAppliedTags: async list => { thread.appliedTags = list; },
          setArchived: async value => { thread.archived = value; }
        });
        thread._messages.set(thread.id, { id: thread.id, body: message });
        env.log.threads.push({ name, message, appliedTags, id: thread.id });
        return thread;
      }
    }
  };
  env.channels.set(channelId, forum);
  return forum;
}

function fakeClient(env) {
  return {
    user: { id: env.me.id },
    guilds: { cache: new Map([[env.guild.id, env.guild]]) },
    channels: { fetch: async channelId => env.channels.get(String(channelId)) || Promise.reject(discordError(10003)) },
    users: { fetch: async userId => ({ id: userId, send: async body => { env.log.dms.push({ to: userId, body }); } }) }
  };
}

module.exports = { fakeGuild, textChannel, forumChannel, fakeClient, discordError, permissionSet, ALL };
