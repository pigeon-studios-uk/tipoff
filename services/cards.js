/**
 * The case card: one Components V2 message per case, edited as the case changes. Built as plain JSON so
 * it can be checked in tests without Discord.
 *
 * Safety rules, every time:
 *   - nobody is pinged, except the urgent role on the urgent line when this post is allowed to (limits.js)
 *   - links in reported text and embeds are shown as code, so a scam link can't be clicked by accident
 *   - images are spoilered (they may be NSFW)
 *   - all text stays within Discord's 4,000-character limit, trimming the reported text first
 */

const ui = require("./ui");
const { defang, quote, planAttachments } = require("./evidence");
const en = require("../strings/en");

const T = { ActionRow: 1, Button: 2, StringSelect: 3, Section: 9, TextDisplay: 10, Thumbnail: 11, MediaGallery: 12, File: 13, Separator: 14, Container: 17 };
const STYLE = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 };
const FLAGS = { IsComponentsV2: 1 << 15 };

const ACCENT = { open: ui.ACCENTS.brand, claimed: 0x3e63dd, resolved: ui.ACCENTS.success, dismissed: 0x8b8d98 };
const MAX_REPORTERS = 10;
const NOTE_MAX = 300;

const ts = (msValue, style = "R") => (msValue ? `<t:${Math.floor(new Date(msValue).getTime() / 1000)}:${style}>` : "?");
const mention = id => (id ? `<@${id}>` : "?");
const text = content => ({ type: T.TextDisplay, content });
const divider = () => ({ type: T.Separator, divider: true, spacing: 1 });
const cut = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function jumpUrl(c) {
  return c.kind === "message" && c.target_message_id ? `https://discord.com/channels/${c.guild_id}/${c.target_channel_id}/${c.target_message_id}` : null;
}

function whoWrote(author, s = en) {
  if (!author) return "?";
  const clean = name => String(name || "").replace(/[*_`~|<>@]/g, "").slice(0, 80) || "?";
  if (author.kind === "webhook") return s.card.webhook(clean(author.webhookName || "webhook"));
  if (author.kind === "app") return s.card.app(mention(author.appUserId));
  if (author.kind === "bot") return s.card.bot(mention(author.userId));
  return mention(author.userId);
}

/** The reported text, embeds, stickers and poll as text blocks. */
function messageText(ev, s = en) {
  const parts = [];
  if (ev.content) parts.push(quote(defang(ev.content)));
  if (ev.componentText) parts.push(quote(defang(ev.componentText)));
  if (!ev.content && !ev.componentText && !(ev.embeds || []).length && !(ev.attachments || []).length) parts.push(s.card.noText);
  for (const e of ev.embeds || []) {
    const lines = [e.author && `**${e.author}**`, e.title && `**${e.title}**`, e.description, ...(e.fields || []).map(f => `**${f.name}**: ${f.value}`), e.url]
      .filter(Boolean).map(line => defang(line));
    if (lines.length) parts.push(`-# ${s.card.embeds}\n${quote(lines.join("\n"))}`);
  }
  if ((ev.stickers || []).length) parts.push(s.card.stickers(ev.stickers.join(", ")));
  if (ev.poll) parts.push(s.card.poll(defang(ev.poll)));
  return parts.join("\n");
}

function hasDefangedLinks(ev) {
  const all = [ev.content, ev.componentText, ev.poll, ...(ev.embeds || []).flatMap(e => [e.title, e.description, e.url, ...(e.fields || []).map(f => f.value)])];
  return all.some(value => /https?:\/\//i.test(value || ""));
}

/** Media gallery and file components for attachments copied onto the card, and links for the rest. */
function attachmentParts(ev, s = en) {
  const copied = (ev.attachments || []).filter(a => a.copiedAs);
  const links = (ev.attachments || []).filter(a => !a.copiedAs);
  const parts = [];
  const images = copied.filter(a => (a.contentType || "").startsWith("image/"));
  const files = copied.filter(a => !(a.contentType || "").startsWith("image/"));
  if (images.length) parts.push({ type: T.MediaGallery, items: images.slice(0, 10).map(a => ({ media: { url: `attachment://${a.copiedAs}` }, spoiler: true })) });
  for (const a of files.slice(0, 3)) parts.push({ type: T.File, file: { url: `attachment://${a.copiedAs}` }, spoiler: true });
  if (links.length) parts.push(text(s.card.tooBig(links.map(a => `[${a.name.replace(/[[\]]/g, "")}](${a.url})`).join(" · "))));
  return parts;
}

function reporterLines(reps, s = en) {
  const shown = reps.slice(-MAX_REPORTERS);
  return shown.map(r => {
    const who = Number(r.anonymous) ? `**${s.card.anonymous}**` : mention(r.reporter_id);
    const note = r.note ? quote(cut(defang(String(r.note)), NOTE_MAX)) : `-# ${s.card.noNote}`;
    return `${who} · ${ts(r.updated_at || r.created_at)}${Number(r.urgent) ? " · ⚠" : ""}\n${note}`;
  });
}

/**
 * Builds the card. view: { c (tp_cases row), ev (evidence), reps (reporters), hist, settings, botCan, linked, reposted,
 * ping, strings (the server's language; English if left out) } -> { flags, components, allowedMentions }. Nothing about
 * whether it's a first post or an edit: delivery.js sends it either way.
 */
function render({ c, ev = {}, reps = [], hist = null, settings = {}, botCan = {}, linked = null, reposted = false, ping = false, strings: s = en }) {
  const status = s.card.status[c.status] || c.status;
  const header = [
    `### #${c.number} · ${s.card.kinds[c.kind] || c.kind} · ${c.reason}`,
    `**${status}** · ${s.card.reports(reps.length || 1)}`,
    Number(c.escalated) ? `**${s.card.escalated}**` : null,
    Number(c.escalated) && !settings.escalationChannelId ? s.card.escalatedFallback : null
  ].filter(Boolean).join("\n");

  const body = [];
  let mainText = "";
  if (c.kind === "message") {
    mainText = messageText(ev, s);
    const flags = [ev.forwarded && s.card.forwarded, ev.editedAt && s.card.edited].filter(Boolean).join(" · ");
    const by = [s.card.by(whoWrote(ev.author, s), ts(ev.createdAt, "f"), ev.channelId ? `<#${ev.channelId}>` : null), flags].filter(Boolean).join(" · ");
    const reply = ev.replyTo ? s.card.reply(`[a message](https://discord.com/channels/${c.guild_id}/${ev.channelId}/${ev.replyTo.messageId})`) : null;
    body.push({ key: "main", value: mainText }, { key: "by", value: [by, reply, hasDefangedLinks(ev) ? s.card.linksNote : null].filter(Boolean).join("\n") });
  } else if (c.kind === "user") {
    const name = [ev.globalName && `**${ev.globalName.replace(/[*_`~|]/g, "")}**`, ev.nick && `(${ev.nick.replace(/[*_`~|]/g, "")})`].filter(Boolean).join(" ");
    const lines = [
      `${mention(ev.userId)}${name ? ` · ${name}` : ""}`,
      `-# ${s.card.memberDates(ts(ev.createdAt), ev.joinedAt ? ts(ev.joinedAt) : null)}`,
      (ev.roleIds || []).length ? s.card.roles(ev.roleIds.slice(0, 10).map(id => `<@&${id}>`).join(" ")) : null,
      ev.timedOutUntil && ev.timedOutUntil > Date.now() ? s.card.timedOut(ts(ev.timedOutUntil, "f")) : null,
      ev.inServer === false ? s.card.leftServer : null
    ].filter(Boolean);
    body.push({ key: "user", value: lines.join("\n"), avatar: ev.avatarUrl });
  } else {
    mainText = ev.content ? quote(defang(ev.content)) : s.card.noText;
    body.push({ key: "main", value: mainText });
  }

  const context = [
    hist && c.target_user_id ? `-# ${s.card.history(hist.total, hist.resolved, hist.dismissed)}` : null,
    linked ? `-# ${s.card.earlier(linked.number, s.card.status[linked.status] || linked.status)}` : null
  ].filter(Boolean).join("\n");

  const reporterBlock = [`**${s.card.reportersHeading}**`, ...reporterLines(reps, s),
    reps.length > MAX_REPORTERS ? `-# ${s.card.moreReporters(reps.length - MAX_REPORTERS, c.number)}` : null].filter(Boolean).join("\n");

  const state = [
    c.status === "claimed" && c.claimed_by ? s.card.claimedBy(mention(c.claimed_by), ts(c.claimed_at)) : null,
    (c.status === "resolved" || c.status === "dismissed") && c.closed_by ? s.card.closedBy(status, mention(c.closed_by), ts(c.closed_at)) : null,
    (c.status === "resolved" || c.status === "dismissed") && c.close_note ? s.card.note(defang(String(c.close_note))) : null,
    reposted ? s.card.reposted : null
  ].filter(Boolean).join("\n");

  // keep within Discord's text limit: trim the reported text, then the reporters, never the header
  const fixed = [header, context, state, ...body.filter(b => b.key !== "main").map(b => b.value)].join("").length;
  let budget = ui.TEXT_LIMIT - fixed - reporterBlock.length - 50;
  let reportersText = reporterBlock;
  if (budget < 200) {
    reportersText = cut(reporterBlock, Math.max(200, ui.TEXT_LIMIT - fixed - 250));
    budget = ui.TEXT_LIMIT - fixed - reportersText.length - 50;
  }
  const inner = [text(header)];
  for (const part of body) {
    if (part.key === "main") inner.push(text(cut(part.value || s.card.noText, Math.max(100, budget))));
    else if (part.key === "user" && part.avatar) inner.push({ type: T.Section, components: [text(part.value)], accessory: { type: T.Thumbnail, media: { url: part.avatar } } });
    else if (part.value) inner.push(text(part.value));
  }
  inner.push(...attachmentParts(ev, s));
  if (context) inner.push(text(context));
  inner.push(divider(), text(reportersText));
  if (state) inner.push(divider(), text(state));

  const components = [];
  const urgentRole = settings.urgentRoleId;
  if (Number(c.urgent)) components.push(text(urgentRole ? `**${s.card.urgent(`<@&${urgentRole}>`)}**` : `**${s.card.urgentNoRole}**`));
  components.push({ type: T.Container, accent_color: ACCENT[c.status] ?? ACCENT.open, components: inner });
  components.push(...buttonRows(c, botCan, ev, s));

  return {
    flags: FLAGS.IsComponentsV2,
    components,
    allowedMentions: ping && urgentRole ? { parse: [], roles: [String(urgentRole)] } : { parse: [] }
  };
}

function button(label, style, customId) {
  return { type: T.Button, style, label, custom_id: customId };
}

/** The buttons under the card, and the Actions menu with only what Tipoff can do in this server. */
function buttonRows(c, botCan = {}, ev = {}, s = en) {
  const id = c.id;
  const jump = jumpUrl(c);
  const row = [];
  if (c.status === "open") row.push(button(s.card.buttons.claim, STYLE.Primary, `case:claim:${id}`));
  if (c.status === "claimed") row.push(button(s.card.buttons.unclaim, STYLE.Secondary, `case:unclaim:${id}`));
  if (c.status === "open" || c.status === "claimed") {
    row.push(button(s.card.buttons.resolve, STYLE.Success, `case:resolve:${id}`), button(s.card.buttons.dismiss, STYLE.Secondary, `case:dismiss:${id}`));
  } else {
    row.push(button(s.card.buttons.reopen, STYLE.Secondary, `case:reopen:${id}`));
  }
  if (jump) row.push({ type: T.Button, style: STYLE.Link, label: s.card.buttons.jump, url: jump });
  const rows = [{ type: T.ActionRow, components: row }];

  if (c.status === "open" || c.status === "claimed") {
    const a = s.card.actions;
    const options = [];
    if (c.kind === "message" && botCan.delete && !ev.deleted) options.push({ label: a.delete, value: "delete", description: a.deleteHint });
    if (c.target_user_id && botCan.timeout) options.push({ label: a.timeout, value: "timeout", description: a.timeoutHint });
    if (c.target_user_id && botCan.kick) options.push({ label: a.kick, value: "kick", description: a.kickHint });
    if (c.target_user_id && botCan.ban) options.push({ label: a.ban, value: "ban", description: a.banHint });
    if (options.length) rows.push({ type: T.ActionRow, components: [{ type: T.StringSelect, custom_id: `case:act:${id}`, placeholder: s.card.buttons.actions, options }] });
  }
  return rows;
}

/** The forum post's name: "#142 · @someone · Spam or scam", within Discord's 100 characters. */
function threadName(c, ev, s = en) {
  const fallback = s.card.threadFallback;
  const who = c.kind === "user" ? `@${ev.username || fallback.user}` : c.kind === "message" ? `@${ev.author?.name || fallback.message}` : s.card.kinds.general;
  return cut(s.card.threadName(c.number, who, c.reason), 100);
}

/** Every text display's content in a rendered card, joined. For tests and length checks. */
function allText(body) {
  const out = [];
  const walk = item => {
    if (!item) return;
    // plain JSON (cards) or discord.js builders (services/ui.js)
    const comp = typeof item.toJSON === "function" ? item.toJSON() : item;
    if (comp.type === T.TextDisplay) out.push(comp.content);
    for (const child of comp.components || []) walk(child);
  };
  body.components.forEach(walk);
  return out.join("\n");
}

module.exports = { T, STYLE, FLAGS, ACCENT, MAX_REPORTERS, render, buttonRows, threadName, jumpUrl, allText, planAttachments };
