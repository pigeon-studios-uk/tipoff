/**
 * Phases 1 to 3 without a database: the report and setup forms, evidence capture, the case card, and the checks on
 * moderator actions.
 */

require("./helpers");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const settingsStore = require("../services/settings");
const reports = require("../services/reports");
const evidence = require("../services/evidence");
const cards = require("../services/cards");
const actions = require("../services/actions");
const modals = require("../services/modals");
const setupCommand = require("../commands/setup");
const caseComponent = require("../components/case");
const ui = require("../services/ui");
const t = require("../strings/en");
const { fakeGuild, permissionSet } = require("./fakeDiscord");
const { PermissionFlagsBits: P } = require("discord.js");

const base = settingsStore.shape({ guild_id: "1", report_channel_id: "2" });
const withAll = { ...base, urgentRoleId: "3", anonymous: true };

// --- forms ---

test("every form fits Discord's 5-part limit, with options only when the server has them on", () => {
  for (const settings of [base, withAll]) {
    for (const kind of ["message", "user", "general"]) {
      const form = reports.buildForm(kind, settings, { customId: "report:x", preview: "p" });
      assert.ok(form.components.length <= 5, `${kind} has ${form.components.length}`);
      const options = form.components.find(c => c.component?.custom_id === "options");
      assert.equal(Boolean(options), settings === withAll, `${kind} options`);
      if (options) assert.deepEqual(options.component.options.map(o => o.value), ["urgent", "anonymous"]);
    }
  }
  assert.throws(() => modals.modal("x", "x", [1, 2, 3, 4, 5, 6].map(() => modals.textDisplay("a"))), /Discord allows 5/);
});

test("reasons: the defaults or the server's own, always ending with Other", () => {
  const form = reports.buildForm("user", base, { customId: "report:x" });
  const radio = form.components.find(c => c.component?.custom_id === "reason").component;
  assert.deepEqual(radio.options.map(o => o.value), [...t.defaultReasons, "Other"]);
  const own = settingsStore.shape({ guild_id: "1" }, [], [{ position: 1, label: "B" }, { position: 0, label: "A" }]);
  assert.deepEqual(own.reasons, ["A", "B", "Other"]);
  assert.deepEqual(settingsStore.parseReasons("Spam\n\n  spam \nOther\nToxic"), ["Spam", "Toxic"]);
  assert.throws(() => settingsStore.parseReasons(Array.from({ length: 10 }, (_, i) => `R${i}`).join("\n")), e => /up to 9/.test(e.userMessage));
});

test("every /setup form starts from the saved settings, so saving one thing never changes another", () => {
  const saved = settingsStore.shape({ guild_id: "1", report_channel_id: "2", user_report_channel_id: "4", anonymous_enabled: 1, urgent_role_id: "3", outcome_dms: 1, close_forum_posts: 0, retention_days: 120 },
    [{ role_id: "8", kind: "moderator" }], []);
  const channels = setupCommand.forms.channels(saved);
  const byId = id => channels.components.find(c => c.component.custom_id === id).component;
  assert.deepEqual(byId("report").default_values, [{ id: "2", type: "channel" }]);
  assert.deepEqual(byId("user").default_values, [{ id: "4", type: "channel" }]);
  assert.deepEqual(byId("urgent").default_values, [{ id: "3", type: "role" }]);
  assert.equal(byId("options").options[0].default, true, "anonymous stays ticked");
  const limitsForm = setupCommand.forms.limits(saved);
  const limitOpts = limitsForm.components.find(c => c.component.custom_id === "options").component.options;
  assert.equal(limitOpts.find(o => o.value === "outcomeDms").default, true);
  assert.equal(limitOpts.find(o => o.value === "closePosts").default, undefined);
  assert.equal(limitsForm.components.find(c => c.component.custom_id === "retention").component.value, "120");
  assert.deepEqual(setupCommand.forms.roles(saved).components[0].component.default_values, [{ id: "8", type: "role" }]);
  for (const form of Object.values(setupCommand.forms)) assert.ok(form(saved).components.length <= 5);
});

test("limits must be whole numbers in range", () => {
  assert.equal(settingsStore.parseLimit("retention_days", "90", "Days"), 90);
  for (const bad of ["29", "366", "9.5", "-1", "", "ten"]) {
    assert.throws(() => settingsStore.parseLimit("retention_days", bad, "Days"), e => /30 to 365/.test(e.userMessage), bad);
  }
});

test("moderator action forms: timeout has the four lengths, kick and ban need a confirm tick", () => {
  const c = { id: 7, number: 142 };
  const timeout = caseComponent.actionForm("timeout", c);
  assert.deepEqual(timeout.components[0].component.options.map(o => o.value), ["600", "3600", "86400", "604800"]);
  const ban = caseComponent.actionForm("ban", c);
  assert.deepEqual(ban.components[1].component.options.map(o => o.value), ["yes", "deleteMessages"]);
  assert.equal(caseComponent.closeForm("resolve", c).custom_id, "case:close:resolve:7");
});

// --- evidence ---

const msg = (over = {}) => ({
  id: "600", channelId: "601", author: { id: "602", username: "someone", bot: false }, content: "hi",
  createdTimestamp: 1_700_000_000_000, editedTimestamp: null, attachments: new Map(), embeds: [], ...over
});

test("webhook, bot and app messages can be reported, and say what they are", () => {
  const hook = evidence.fromMessage(msg({ webhookId: "9", author: { id: "603", username: "PluralKit Alt", bot: true } }), { reporterId: "1" }).snapshot;
  assert.deepEqual([hook.author.kind, hook.author.userId, hook.author.webhookName], ["webhook", null, "PluralKit Alt"]);
  const app = evidence.fromMessage(msg({ author: { id: "604", username: "Bot", bot: true }, interactionMetadata: { user: { id: "605", username: "runner" } } }), { reporterId: "1" }).snapshot;
  assert.deepEqual([app.author.kind, app.author.userId], ["app", "605"]);
  const bot = evidence.fromMessage(msg({ author: { id: "606", username: "Spam", bot: true } }), { reporterId: "1" }).snapshot;
  assert.equal(bot.author.kind, "bot");
});

test("you can't report yourself, your own message, your own app command, or Tipoff", () => {
  assert.equal(evidence.fromMessage(msg(), { reporterId: "602" }).refused, "ownMessage");
  assert.equal(evidence.fromMessage(msg({ author: { id: "604", bot: true }, interactionMetadata: { user: { id: "1" } } }), { reporterId: "1" }).refused, "ownMessage");
  assert.equal(evidence.fromMessage(msg({ author: { id: "777", bot: true } }), { reporterId: "1", botId: "777" }).refused, "bot");
  assert.equal(evidence.fromUser({ id: "1" }, null, { reporterId: "1" }).refused, "self");
  assert.equal(evidence.fromMessage(null, { reporterId: "1" }).refused, "gone");
});

test("forwards, embeds, stickers, polls, replies and Components V2 text are all captured", () => {
  const snap = evidence.fromMessage(msg({
    content: "",
    messageSnapshots: new Map([["x", { message: { content: "forwarded text", attachments: new Map(), embeds: [] } }]])
  }), { reporterId: "1" }).snapshot;
  assert.equal(snap.forwarded, true);
  assert.equal(snap.content, "forwarded text");

  const rich = evidence.fromMessage(msg({
    embeds: [{ data: { title: "Free Nitro", description: "claim at https://scam.example", fields: [{ name: "a", value: "b" }] } }],
    stickers: new Map([["s", { name: "wave" }]]),
    poll: { question: { text: "Best mod?" } },
    reference: { messageId: "599" },
    components: [{ type: 17, components: [{ type: 10, content: "v2 text" }] }],
    editedTimestamp: 1_700_000_100_000
  }), { reporterId: "1" }).snapshot;
  assert.equal(rich.embeds[0].title, "Free Nitro");
  assert.deepEqual(rich.stickers, ["wave"]);
  assert.equal(rich.poll, "Best mod?");
  assert.deepEqual(rich.replyTo, { messageId: "599" });
  assert.equal(rich.componentText, "v2 text");
  assert.equal(evidence.editStamp(rich), 1_700_000_100, "an edited message is keyed by its edit");
});

test("attachments are copied only within the server's upload limit; the rest become links, and the report still goes", () => {
  const mb = n => n * 1024 * 1024;
  const plan = evidence.planAttachments([{ name: "a", size: mb(4) }, { name: "big", size: mb(15) }, { name: "b", size: mb(5) }, { name: "c", size: mb(3) }], mb(10));
  assert.deepEqual(plan.copy.map(a => a.name), ["a", "b"]);
  assert.deepEqual(plan.link.map(a => a.name), ["big", "c"]);
});

test("only Discord's CDN is ever downloaded, and a failed download becomes a link", async () => {
  const fetched = [];
  const fetchImpl = async url => {
    fetched.push(String(url));
    if (String(url).includes("broken")) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  const result = await evidence.download({
    copy: [
      { name: "x.png", url: "https://cdn.discordapp.com/attachments/1/2/x.png" },
      { name: "x.png", url: "https://media.discordapp.net/attachments/1/3/x.png" },
      { name: "evil", url: "http://169.254.169.254/latest" },
      { name: "broken", url: "https://cdn.discordapp.com/broken" }
    ],
    link: []
  }, { fetchImpl });
  assert.deepEqual(result.files.map(f => f.name), ["x.png", "1_x.png"], "duplicate names are made unique");
  assert.deepEqual(result.link.map(a => a.name), ["evil", "broken"]);
  assert.ok(!fetched.some(url => url.includes("169.254")), "never fetched");
});

test("links are shown as code so they can't be clicked", () => {
  assert.equal(evidence.defang("go to https://scam.example/x now"), "go to `https://scam.example/x` now");
  assert.equal(evidence.defang("https://a.b/`c`"), "`https://a.b/c`");
});

// --- the card ---

const caseRow = (over = {}) => ({
  id: 7, guild_id: "1", number: 142, kind: "message", reason: "Spam or scam", status: "open", target_user_id: "602",
  target_channel_id: "601", target_message_id: "600", urgent: 0, escalated: 0, ...over
});
const ev = (over = {}) => ({ ...evidence.fromMessage(msg({ content: "@everyone free nitro https://scam.example" }), { reporterId: "1" }).snapshot, ...over });
const rep = (over = {}) => ({ reporter_id: "11", anonymous: 0, urgent: 0, note: "they DM'd me", created_at: new Date(), updated_at: new Date(), ...over });

test("the card pings nobody, defangs links, and spoilers images", () => {
  const body = cards.render({ c: caseRow(), ev: ev({ attachments: [{ name: "a.png", url: "u", size: 1, contentType: "image/png", copiedAs: "a.png" }] }), reps: [rep()] });
  assert.deepEqual(body.allowedMentions, { parse: [] });
  const text = cards.allText(body);
  assert.match(text, /`https:\/\/scam\.example`/);
  assert.match(text, /#142 · Message reported · Spam or scam/);
  const gallery = body.components[0].components.find(c => c.type === cards.T.MediaGallery);
  assert.equal(gallery.items[0].spoiler, true);
  assert.equal(gallery.items[0].media.url, "attachment://a.png");
});

test("the urgent role is pinged only when this post may ping", () => {
  const settings = { urgentRoleId: "3" };
  const quiet = cards.render({ c: caseRow({ urgent: 1 }), ev: ev(), reps: [rep()], settings });
  assert.deepEqual(quiet.allowedMentions, { parse: [] });
  assert.match(cards.allText(quiet), /<@&3> · urgent report/);
  const loud = cards.render({ c: caseRow({ urgent: 1 }), ev: ev(), reps: [rep()], settings, ping: true });
  assert.deepEqual(loud.allowedMentions, { parse: [], roles: ["3"] });
});

test("anonymous reporters are never named on the card", () => {
  // a full-length ID that can't turn up by chance in the card's timestamps (a short one like "99" sometimes did)
  const reporter = "424242424242424242";
  const text = cards.allText(cards.render({ c: caseRow(), ev: ev(), reps: [rep({ reporter_id: reporter, anonymous: 1 })] }));
  assert.ok(!text.includes(reporter));
  assert.match(text, /Anonymous/);
});

test("buttons follow the status, and Actions only offers what Tipoff can do", () => {
  const labels = rows => rows.flatMap(r => r.components.map(c => c.label || c.placeholder));
  assert.deepEqual(labels(cards.buttonRows(caseRow(), {})), ["Claim", "Resolve", "Dismiss", "Jump to message"]);
  assert.deepEqual(labels(cards.buttonRows(caseRow({ status: "claimed" }), {})), ["Unclaim", "Resolve", "Dismiss", "Jump to message"]);
  assert.deepEqual(labels(cards.buttonRows(caseRow({ status: "resolved" }), { ban: true })), ["Reopen", "Jump to message"]);
  const withActions = cards.buttonRows(caseRow(), { delete: true, ban: true });
  assert.deepEqual(withActions[1].components[0].options.map(o => o.value), ["delete", "ban"]);
  assert.deepEqual(cards.buttonRows(caseRow({ kind: "general", target_user_id: null, target_message_id: null }), { delete: true, ban: true }).length, 1);
});

test("a huge message with 50 reporters still fits Discord's 4,000-character limit, with the header intact", () => {
  const body = cards.render({
    c: caseRow({ escalated: 1 }), ev: ev({ content: "x".repeat(4000), embeds: [{ title: "t", description: "d".repeat(500), fields: [] }] }),
    reps: Array.from({ length: 50 }, (_, i) => rep({ reporter_id: String(1000 + i), note: "n".repeat(1000) })), hist: { total: 3, resolved: 2, dismissed: 1 }
  });
  const text = cards.allText(body);
  assert.ok(text.length <= ui.TEXT_LIMIT, `${text.length}`);
  assert.match(text, /#142/);
  assert.match(text, /and 40 more/);
  assert.match(text, /Escalated/);
  assert.match(text, /No escalation channel is set/);
});

test("forum post names fit Discord's 100 characters", () => {
  assert.ok(cards.threadName(caseRow({ reason: "r".repeat(150) }), ev()).length <= 100);
});

// --- moderator actions ---

function actionEnv({ actorRole = 5, targetRole = 3, botRole = 10, actorPerms = Object.values(P), botPerms = Object.values(P), ownerId = "100" } = {}) {
  const env = fakeGuild({ botPerms, botRole, ownerId });
  env.guild._members.set("602", { id: "602", roles: { highest: { position: targetRole } } });
  const interaction = {
    guild: env.guild, user: { id: "50", username: "mod" },
    member: { id: "50", roles: { highest: { position: actorRole } } },
    memberPermissions: permissionSet(actorPerms)
  };
  return { env, interaction };
}

test("actions: the moderator's own permission, their role above the target's, and Tipoff's too", async () => {
  const c = caseRow();
  const ok = actionEnv();
  assert.ok((await actions.check(ok.interaction, "kick", c)).member);

  const noPerm = actionEnv({ actorPerms: [P.ModerateMembers] });
  await assert.rejects(actions.check(noPerm.interaction, "kick", c), e => /You need \*\*Kick Members\*\*/.test(e.userMessage));

  const botNoPerm = actionEnv({ botPerms: [P.ViewChannel] });
  await assert.rejects(actions.check(botNoPerm.interaction, "ban", c), e => /Tipoff needs \*\*Ban Members\*\*/.test(e.userMessage));

  const lower = actionEnv({ actorRole: 3, targetRole: 3 });
  await assert.rejects(actions.check(lower.interaction, "timeout", c), e => /same as or above yours/.test(e.userMessage));

  const botLower = actionEnv({ botRole: 2 });
  await assert.rejects(actions.check(botLower.interaction, "timeout", c), e => /Tipoff's role has to be above/.test(e.userMessage));

  const owner = actionEnv({ ownerId: "602" });
  await assert.rejects(actions.check(owner.interaction, "ban", c), e => /server owner/.test(e.userMessage));
});

test("a member who left can still be banned, but not timed out or kicked", async () => {
  const { env, interaction } = actionEnv();
  env.guild._members.clear();
  assert.equal((await actions.check(interaction, "ban", caseRow())).member, null);
  await assert.rejects(actions.check(interaction, "kick", caseRow()), e => /not in the server/.test(e.userMessage));
});

test("the audit log reason names the case and the moderator", () => {
  assert.equal(t.caseActions.auditReason(142, "mod", "spam"), "Tipoff case #142, by mod: spam");
});
