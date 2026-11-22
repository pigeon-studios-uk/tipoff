/**
 * The snapshot of what was reported, taken from the interaction's own data the moment someone opens the form.
 * Tipoff never fetches or reads messages itself: everything here comes from what Discord sends with the
 * right-click.
 *
 * Webhook, bot and app messages can be reported (PluralKit, compromised webhooks, spam bots); embeds, stickers, polls, the replied-to message and Components V2 text are captured, not just plain
 * text; attachments are copied only up to the server's real upload limit, and one that can't be copied becomes a link
 * instead of failing the whole report.
 */

const LIMITS = { content: 4000, embeds: 5, embedText: 500, fields: 5, attachments: 10, componentText: 1000 };
const DEFAULT_UPLOAD_LIMIT = 10 * 1024 * 1024; // Discord's limit for an unboosted server
const DOWNLOAD_TIMEOUT_MS = 20000;

const ms = value => (value ? new Date(value).getTime() : null);
const cut = (text, max) => {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const list = value => (value ? (typeof value.values === "function" ? [...value.values()] : Array.isArray(value) ? value : Object.values(value)) : []);

function attachmentsOf(raw) {
  return list(raw).slice(0, LIMITS.attachments).map(a => ({
    name: String(a.name || a.filename || "file").replace(/[^\w.\- ]+/g, "_").slice(-80) || "file",
    url: a.url,
    size: Number(a.size || 0),
    contentType: a.contentType || a.content_type || null
  }));
}

function embedsOf(raw) {
  return list(raw).slice(0, LIMITS.embeds).map(e => {
    const d = e.data || e;
    return {
      title: d.title ? cut(d.title, 256) : null,
      description: d.description ? cut(d.description, LIMITS.embedText) : null,
      url: d.url || null,
      author: d.author?.name ? cut(d.author.name, 100) : null,
      fields: (d.fields || []).slice(0, LIMITS.fields).map(f => ({ name: cut(f.name, 100), value: cut(f.value, 200) }))
    };
  }).filter(e => e.title || e.description || e.url || e.author || e.fields.length);
}

/** Text from a Components V2 message (text displays, nested in containers and sections). */
function componentText(components) {
  const out = [];
  const walk = component => {
    const c = component?.data ? { ...component.data, components: component.components } : component;
    if (!c) return;
    if (c.type === 10 && c.content) out.push(c.content);
    for (const child of list(c.components)) walk(child);
  };
  for (const c of list(components)) walk(c);
  return out.length ? cut(out.join("\n"), LIMITS.componentText) : null;
}

/**
 * Who a message is "by" for the purposes of a report: { kind, userId, name, webhookName, appUserId }.
 *   user      a normal message
 *   app       a bot's reply to a slash command: blamed on the person who ran it
 *   webhook   PluralKit, Tupperbox, integrations, compromised webhooks: no user to blame, the webhook's name shown
 *   bot       any other bot message
 */
function authorOf(message) {
  const author = message.author || {};
  const appUser = message.interactionMetadata?.user || message.interaction_metadata?.user || message.interaction?.user || null;
  if (message.webhookId || message.webhook_id) {
    return { kind: "webhook", userId: null, name: author.username || "webhook", webhookName: author.username || null, appUserId: null };
  }
  if (author.bot && appUser) return { kind: "app", userId: String(appUser.id), name: appUser.username, webhookName: null, appUserId: String(appUser.id), botId: String(author.id) };
  if (author.bot) return { kind: "bot", userId: String(author.id), name: author.username, webhookName: null, appUserId: null };
  return { kind: "user", userId: String(author.id), name: author.username, webhookName: null, appUserId: null };
}

/**
 * The snapshot of a reported message. message is discord.js's Message (or the same shape as plain data).
 * Returns { snapshot } or { refused } (a key of strings.report.refused).
 */
function fromMessage(message, { reporterId, botId, channelName = null, uploadLimit = DEFAULT_UPLOAD_LIMIT } = {}) {
  if (!message) return { refused: "gone" };
  const by = authorOf(message);
  if (botId && String(message.author?.id) === String(botId)) return { refused: "bot" };
  if (String(message.author?.id) === String(reporterId) || by.userId === String(reporterId)) return { refused: "ownMessage" };

  const forwarded = list(message.messageSnapshots || message.message_snapshots)[0];
  const source = forwarded?.message || forwarded || message;
  const reply = message.reference && !forwarded ? message.reference : null;

  return {
    snapshot: {
      kind: "message",
      author: by,
      channelId: String(message.channelId || message.channel_id),
      channelName,
      messageId: String(message.id),
      createdAt: ms(message.createdTimestamp || message.createdAt || message.timestamp),
      editedAt: ms(message.editedTimestamp || message.editedAt || message.edited_timestamp),
      forwarded: Boolean(forwarded),
      content: cut(source.content || "", LIMITS.content),
      componentText: componentText(source.components),
      embeds: embedsOf(source.embeds),
      stickers: list(source.stickers || source.sticker_items).map(s => cut(s.name, 40)).slice(0, 3),
      poll: source.poll?.question?.text ? cut(source.poll.question.text, 300) : null,
      replyTo: reply?.messageId || reply?.message_id ? { messageId: String(reply.messageId || reply.message_id) } : null,
      attachments: attachmentsOf(source.attachments),
      uploadLimit: Number(uploadLimit) || DEFAULT_UPLOAD_LIMIT
    }
  };
}

/** The edit stamp that keys a message case: an edited message is new evidence. */
function editStamp(snapshot) {
  return snapshot.editedAt ? Math.floor(snapshot.editedAt / 1000) : 0;
}

/** The snapshot of a reported member. user is a discord.js User, member a GuildMember or raw member data (or null). */
function fromUser(user, member, { reporterId, botId } = {}) {
  if (!user) return { refused: "gone" };
  if (String(user.id) === String(reporterId)) return { refused: "self" };
  if (botId && String(user.id) === String(botId)) return { refused: "bot" };
  const roleIds = member
    ? (member.roles?.cache ? [...member.roles.cache.keys()] : list(member.roles)).map(String).filter(id => id !== String(member.guild?.id))
    : [];
  return {
    snapshot: {
      kind: "user",
      userId: String(user.id),
      username: user.username,
      globalName: user.globalName || user.global_name || null,
      nick: member?.nickname || member?.nick || null,
      bot: Boolean(user.bot),
      createdAt: ms(user.createdTimestamp || user.createdAt) || snowflakeTime(user.id),
      joinedAt: ms(member?.joinedTimestamp || member?.joinedAt || member?.joined_at),
      avatarUrl: typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ extension: "png", size: 256 }) : null,
      roleIds: roleIds.slice(0, 15),
      timedOutUntil: ms(member?.communicationDisabledUntilTimestamp || member?.communication_disabled_until),
      inServer: Boolean(member)
    }
  };
}

/** A general (/report) snapshot: the details and screenshots. */
function fromGeneral(details, files = [], { uploadLimit = DEFAULT_UPLOAD_LIMIT } = {}) {
  return {
    kind: "general",
    content: cut(details, 2000),
    attachments: attachmentsOf(files).filter(a => !a.contentType || a.contentType.startsWith("image/")).slice(0, 5),
    uploadLimit: Number(uploadLimit) || DEFAULT_UPLOAD_LIMIT
  };
}

function snowflakeTime(id) {
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return null;
  }
}

/**
 * Which attachments get copied onto the card (each, and all together, within the server's upload limit), and which
 * become links. Returns { copy: [...], link: [...] }.
 */
function planAttachments(attachments, uploadLimit = DEFAULT_UPLOAD_LIMIT) {
  const copy = [];
  const link = [];
  let total = 0;
  for (const a of attachments || []) {
    if (a.size > 0 && a.size <= uploadLimit && total + a.size <= uploadLimit) {
      copy.push(a);
      total += a.size;
    } else link.push(a);
  }
  return { copy, link };
}

/**
 * Downloads the attachments to copy. Discord's CDN only: anything else is never fetched (so a crafted URL can't make
 * Tipoff reach inside its own network). One that fails moves to `link`. Returns { files: [{ name, data }], copied, link }.
 */
async function download(plan, { fetchImpl = globalThis.fetch } = {}) {
  const files = [];
  const copied = [];
  const link = [...plan.link];
  for (const a of plan.copy) {
    try {
      const url = new URL(a.url);
      if (url.protocol !== "https:" || !/(^|\.)discordapp\.(com|net)$/.test(url.hostname)) throw new Error("not Discord's CDN");
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "error" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      files.push({ name: a.name, attachment: Buffer.from(await res.arrayBuffer()) });
      copied.push(a);
    } catch {
      link.push(a);
    }
  }
  // two files can't share a name in one message
  const seen = new Set();
  for (const f of files) {
    let name = f.name;
    for (let i = 1; seen.has(name); i++) name = `${i}_${f.name}`;
    seen.add(name);
    f.name = name;
  }
  copied.forEach((a, i) => { a.copiedAs = files[i].name; });
  return { files, copied, link };
}

/** Links shown as code, so they can't be clicked by accident on a scam message. Backticks are removed. */
function defang(text) {
  return String(text || "").replace(/https?:\/\/[^\s<>]+/gi, url => `\`${url.replace(/`/g, "")}\``);
}

/** A block of text as a Discord quote, line by line. */
function quote(text) {
  return String(text || "").split("\n").map(line => `> ${line}`).join("\n");
}

module.exports = {
  LIMITS, DEFAULT_UPLOAD_LIMIT, authorOf, fromMessage, fromUser, fromGeneral, editStamp, planAttachments, download,
  defang, quote, componentText, snowflakeTime
};
