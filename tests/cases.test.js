/**
 * Phases 1 to 3 on the real test database: cases and merging, status changes, limits, settings, delivery (with a fake
 * Discord) and retention. Skipped locally without a database; always run in CI.
 */

const { databaseTest } = require("./helpers");
const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const sqlStore = require("../services/sqlStore");
const cases = require("../services/cases");
const limits = require("../services/limits");
const settingsStore = require("../services/settings");
const delivery = require("../services/delivery");
const retention = require("../services/retention");
const reports = require("../services/reports");
const evidence = require("../services/evidence");
const { fakeGuild, textChannel, forumChannel, fakeClient } = require("./fakeDiscord");

const options = databaseTest();
let nextGuild = 810000000000000000n;
const newGuild = () => String(nextGuild++);

before(async () => { if (!options.skip) await sqlStore.setup(); });
after(() => sqlStore.close());

async function wipe(guildId) {
  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [guildId]);
  for (const table of retention.GUILD_TABLES) await sqlStore.query(`DELETE FROM ${table} WHERE guild_id = ?`, [guildId]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [guildId]);
}

const snapshot = (over = {}) => ({
  kind: "message", author: { kind: "user", userId: "602", name: "someone" }, channelId: "601", messageId: "600",
  createdAt: Date.now(), editedAt: null, content: "spam", embeds: [], stickers: [], attachments: [], uploadLimit: 10485760, ...over
});
const messageReport = (guildId, over = {}) => ({
  guildId, kind: "message", reason: "Spam or scam", snapshot: snapshot(), targetUserId: "602", targetChannelId: "601",
  targetMessageId: "600", editStamp: 0, reporterId: "11", anonymous: false, urgent: false, note: null, escalated: false, ...over
});

test("reports about the same message join one case; the same reporter twice updates their note", options, async () => {
  const g = newGuild();
  const first = await cases.submit(messageReport(g, { note: "first" }));
  const second = await cases.submit(messageReport(g, { reporterId: "12", note: "me too" }));
  const again = await cases.submit(messageReport(g, { note: "updated" }));
  assert.equal(first.joined, false);
  assert.equal(second.joined, true);
  assert.equal(second.caseId, first.caseId);
  assert.equal(again.newReporter, false);
  const reps = await cases.reporters(first.caseId);
  assert.deepEqual(reps.map(r => [String(r.reporter_id), r.note]), [["11", "updated"], ["12", "me too"]]);
  assert.equal(first.number, 1);
  await wipe(g);
});

test("ten reports arriving at once make one case, not ten", options, async () => {
  const g = newGuild();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => cases.submit(messageReport(g, { reporterId: String(100 + i) }))));
  assert.equal(new Set(results.map(r => r.caseId)).size, 1);
  assert.equal(results.filter(r => !r.joined).length, 1);
  assert.equal((await cases.reporters(results[0].caseId)).length, 10);
  await wipe(g);
});

test("two anonymous reports at the same moment both keep their notes", options, async () => {
  const g = newGuild();
  const now = new Date();
  await Promise.all([
    cases.submit(messageReport(g, { reporterId: "21", anonymous: true, note: "a" }), { now }),
    cases.submit(messageReport(g, { reporterId: "22", anonymous: true, note: "b" }), { now })
  ]);
  const [row] = await sqlStore.query("SELECT id FROM tp_cases WHERE guild_id = ?", [g]);
  assert.deepEqual((await cases.reporters(row.id)).map(r => r.note).sort(), ["a", "b"]);
  await wipe(g);
});

test("an edited message is a new case that links back; a closed case's target opens a new case next time", options, async () => {
  const g = newGuild();
  const original = await cases.submit(messageReport(g));
  const edited = await cases.submit(messageReport(g, { editStamp: 1700000100, snapshot: snapshot({ editedAt: 1700000100000 }) }));
  assert.notEqual(edited.caseId, original.caseId);
  assert.equal(Number((await cases.byId(edited.caseId)).linked_case_id), original.caseId);

  const user = await cases.submit({ ...messageReport(g), kind: "user", targetMessageId: null, targetChannelId: null, snapshot: { kind: "user", userId: "602" } });
  assert.ok(await cases.changeStatus(user.caseId, "resolve", "50"));
  const next = await cases.submit({ ...messageReport(g, { reporterId: "13" }), kind: "user", targetMessageId: null, targetChannelId: null, snapshot: { kind: "user", userId: "602" } });
  assert.notEqual(next.caseId, user.caseId);
  assert.equal(Number((await cases.byId(next.caseId)).linked_case_id), user.caseId);
  assert.deepEqual([original.number, edited.number, user.number, next.number], [1, 2, 3, 4]);
  await wipe(g);
});

test("status changes only happen once, even if two moderators press at the same time", options, async () => {
  const g = newGuild();
  const { caseId } = await cases.submit(messageReport(g));
  assert.equal(await cases.changeStatus(caseId, "claim", "50"), true);
  assert.equal(await cases.changeStatus(caseId, "claim", "51"), false);
  const both = await Promise.all([cases.changeStatus(caseId, "resolve", "50"), cases.changeStatus(caseId, "dismiss", "51")]);
  assert.deepEqual(both.filter(Boolean).length, 1);
  const closed = await cases.byId(caseId);
  assert.equal(closed.open_key, null);

  // reopening while a newer case about the same message is open: it reopens, but new reports keep going to the newer one
  const newer = await cases.submit(messageReport(g, { reporterId: "14" }));
  assert.equal(await cases.changeStatus(caseId, "reopen", "50"), true);
  assert.equal((await cases.byId(caseId)).open_key, null);
  assert.equal((await cases.submit(messageReport(g, { reporterId: "15" }))).caseId, newer.caseId);
  await wipe(g);
});

test("history counts earlier cases about the member", options, async () => {
  const g = newGuild();
  const a = await cases.submit(messageReport(g));
  await cases.changeStatus(a.caseId, "dismiss", "50");
  const b = await cases.submit(messageReport(g, { targetMessageId: "700", snapshot: snapshot({ messageId: "700" }) }));
  assert.deepEqual(await cases.history(g, "602", b.caseId), { total: 1, resolved: 0, dismissed: 1 });
  await wipe(g);
});

test("limits: blocked, cool-down and too many open reports", options, async () => {
  const g = newGuild();
  const settings = settingsStore.shape({ guild_id: g, reporter_cooldown_minutes: 2, max_open_reports: 2 });
  assert.deepEqual(await limits.canReport(g, "11", settings), { ok: true });

  const now = new Date();
  await limits.noteReport(g, "11", { now });
  const cooling = await limits.canReport(g, "11", settings, { now: new Date(now.getTime() + 30000) });
  assert.deepEqual([cooling.reason, cooling.minutes], ["cooldown", 2]);
  assert.equal((await limits.canReport(g, "11", settings, { now: new Date(now.getTime() + 121000) })).ok, true);

  await cases.submit(messageReport(g, { reporterId: "30" }));
  await cases.submit(messageReport(g, { reporterId: "30", targetMessageId: "701", snapshot: snapshot({ messageId: "701" }) }));
  assert.equal((await limits.canReport(g, "30", settings)).reason, "tooManyOpen");

  assert.equal(await limits.block(g, "31", "50", "spam reports"), true);
  assert.equal(await limits.block(g, "31", "50"), false);
  assert.equal((await limits.canReport(g, "31", settings)).reason, "blocked");
  assert.equal(await limits.unblock(g, "31"), true);
  await wipe(g);
});

test("the urgent role is pinged at most once per cool-down, even with urgent reports at the same time", options, async () => {
  const g = newGuild();
  const settings = settingsStore.shape({ guild_id: g, urgent_role_id: "3", urgent_cooldown_minutes: 10 });
  const now = new Date();
  const results = await Promise.all(Array.from({ length: 5 }, () => limits.takeUrgentPing(g, settings, { now })));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await limits.takeUrgentPing(g, settings, { now: new Date(now.getTime() + 5 * 60000) }), false);
  assert.equal(await limits.takeUrgentPing(g, settings, { now: new Date(now.getTime() + 11 * 60000) }), true);
  assert.equal(await limits.takeUrgentPing(g, { ...settings, urgentRoleId: null }), false);
  await wipe(g);
});

test("settings save, read back, and are audited", options, async () => {
  const g = newGuild();
  await settingsStore.saveChannels(g, "50", { report: "2", user: null, escalation: "4", urgentRole: "3", anonymous: true });
  await settingsStore.saveRoles(g, "50", { moderators: ["8", "8", "9"], staff: ["10"] });
  await settingsStore.saveReasons(g, "50", ["Spam", "Toxic"]);
  await settingsStore.saveLimits(g, "50", { reporterCooldown: 0, maxOpen: 3, urgentCooldown: 15, retention: 30, outcomeDms: true, closePosts: false });
  const s = await settingsStore.get(g);
  assert.deepEqual([s.reportChannelId, s.userReportChannelId, s.escalationChannelId, s.urgentRoleId, s.anonymous], ["2", null, "4", "3", true]);
  assert.deepEqual(s.moderatorRoleIds.sort(), ["8", "9"]);
  assert.deepEqual(s.staffRoleIds, ["10"]);
  assert.deepEqual(s.reasons, ["Spam", "Toxic", "Other"]);
  assert.deepEqual([s.reporterCooldownMinutes, s.maxOpenReports, s.urgentCooldownMinutes, s.retentionDays, s.outcomeDms, s.closeForumPosts], [0, 3, 15, 30, true, false]);
  const audit = await sqlStore.query("SELECT action FROM tp_audit WHERE guild_id = ? ORDER BY id", [g]);
  assert.deepEqual(audit.map(a => a.action), ["setup.channels", "setup.roles", "setup.reasons", "setup.limits"]);
  await wipe(g);
});

test("report drafts: only their owner can use them, once, within 30 minutes", options, async () => {
  const g = newGuild();
  const id = await reports.saveDraft(g, "11", "message", snapshot());
  assert.equal(await reports.takeDraft(id, g, "12"), null, "someone else");
  assert.equal(await reports.takeDraft(id, newGuild(), "11"), null, "another server");
  assert.equal((await reports.takeDraft(id, g, "11")).snapshot.messageId, "600");
  assert.equal(await reports.takeDraft(id, g, "11"), null, "only once");
  const old = await reports.saveDraft(g, "11", "user", { kind: "user" }, { now: new Date(Date.now() - 31 * 60000) });
  assert.equal(await reports.takeDraft(old, g, "11"), null, "too old");
  assert.equal(await reports.takeDraft("'; DROP TABLE x; --", g, "11"), null);
  await wipe(g);
});

// --- delivery, with a fake Discord ---

async function setUp(channelKind = "text") {
  const env = fakeGuild({ guildId: newGuild() });
  const channel = channelKind === "forum" ? forumChannel(env) : textChannel(env);
  await settingsStore.saveChannels(env.guild.id, "50", { report: channel.id, urgentRole: "3", anonymous: false });
  return { env, channel, client: fakeClient(env), g: env.guild.id };
}

test("a card is posted, then edited in place as the case changes", options, async () => {
  const { env, channel, client, g } = await setUp();
  const { caseId } = await cases.submit(messageReport(g, { urgent: true }));
  assert.deepEqual(await delivery.deliver(client, caseId, { ping: true }), { delivered: true });
  assert.equal(env.log.sent.length, 1);
  assert.deepEqual(env.log.sent[0].body.allowedMentions, { parse: [], roles: ["3"] }, "the first post pings the urgent role");

  await cases.changeStatus(caseId, "claim", "50");
  await delivery.deliver(client, caseId);
  assert.equal(env.log.sent.length, 1, "no second message");
  assert.equal(env.log.edited.length, 1);
  assert.deepEqual(env.log.edited[0].body.allowedMentions, { parse: [] }, "edits never ping");
  const row = await cases.byId(caseId);
  assert.equal(String(row.card_channel_id), channel.id);
  await wipe(g);
});

test("a deleted card is posted again from the saved copy", options, async () => {
  const { env, channel, client, g } = await setUp();
  const { caseId } = await cases.submit(messageReport(g));
  await delivery.deliver(client, caseId);
  channel._messages.clear();
  await cases.changeStatus(caseId, "claim", "50");
  assert.deepEqual(await delivery.deliver(client, caseId), { delivered: true });
  assert.equal(env.log.sent.length, 2);
  assert.match(JSON.stringify(env.log.sent[1].body), /posted from the saved copy/);
  assert.ok((await cases.events(caseId)).some(e => e.action === "reposted"));
  await wipe(g);
});

test("if Tipoff can't post, the report waits, the admins are told once, and /setup check posts it later", options, async () => {
  const { env, channel, client, g } = await setUp();
  channel.fail(50013);
  const first = await cases.submit(messageReport(g));
  const second = await cases.submit(messageReport(g, { targetMessageId: "702", snapshot: snapshot({ messageId: "702" }) }));
  assert.equal((await delivery.deliver(client, first.caseId)).delivered, false);
  assert.equal((await delivery.deliver(client, second.caseId)).delivered, false);
  assert.equal(env.log.dms.length, 1, "the owner is told once, not once per report");
  assert.equal((await cases.undelivered(g)).length, 2);

  channel.fail(null);
  assert.deepEqual(await delivery.redeliver(client, g), { posted: 2, waiting: 0 });
  assert.equal(env.log.sent.length, 2);
  await wipe(g);
});

test("forums: one post per case with its status tag (made if missing), and the post closes when the case does", options, async () => {
  const { env, client, g } = await setUp("forum");
  const { caseId } = await cases.submit(messageReport(g, { urgent: true }));
  await delivery.deliver(client, caseId);
  assert.equal(env.log.threads.length, 1);
  const forum = [...env.channels.values()].find(c => c.availableTags);
  const tagId = name => forum.availableTags.find(tag => tag.name === name).id;
  assert.deepEqual(env.log.threads[0].appliedTags.sort(), [tagId("Open"), tagId("Urgent")].sort());
  assert.match(env.log.threads[0].name, /^#1 · @someone · Spam or scam$/);

  await cases.changeStatus(caseId, "resolve", "50");
  await delivery.deliver(client, caseId);
  const thread = env.channels.get(env.log.threads[0].id);
  assert.deepEqual(thread.appliedTags, [tagId("Resolved")]);
  assert.equal(thread.archived, true);
  await wipe(g);
});

test("reports about staff go to the escalation channel; member reports to the member reports channel", options, async () => {
  const s = settingsStore.shape({ guild_id: "1", report_channel_id: "2", user_report_channel_id: "3", escalation_channel_id: "4" });
  assert.equal(delivery.destination({ kind: "message", escalated: 1 }, s).channelId, "4");
  assert.equal(delivery.destination({ kind: "user", escalated: 0 }, s).channelId, "3");
  assert.equal(delivery.destination({ kind: "message", escalated: 0 }, s).channelId, "2");
  assert.equal(delivery.destination({ kind: "user", escalated: 1 }, { ...s, escalationChannelId: null }).channelId, "3");
});

test("attachments within the upload limit are copied onto the first post; the rest stay links", options, async () => {
  const { env, client, g } = await setUp();
  const mb = n => n * 1024 * 1024;
  const snap = snapshot({ uploadLimit: mb(10), attachments: [
    { name: "a.png", url: "https://cdn.discordapp.com/a.png", size: mb(2), contentType: "image/png" },
    { name: "huge.mp4", url: "https://cdn.discordapp.com/huge.mp4", size: mb(50), contentType: "video/mp4" }
  ] });
  const { caseId } = await cases.submit(messageReport(g, { snapshot: snap }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    await delivery.deliver(client, caseId);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(env.log.sent[0].body.files.map(f => f.name), ["a.png"]);
  const saved = await cases.evidence(caseId);
  assert.equal(saved.attachments[0].copiedAs, "a.png");
  assert.equal(saved.attachments[1].copiedAs, undefined);
  assert.match(JSON.stringify(env.log.sent[0].body), /Too big to copy/);
  await wipe(g);
});

// --- retention ---

test("retention deletes closed cases on time, and servers 30 days after leaving, not before", options, async () => {
  const g = newGuild();
  const left = newGuild();
  const now = new Date();
  await settingsStore.saveLimits(g, "50", { reporterCooldown: 2, maxOpen: 5, urgentCooldown: 10, retention: 30, outcomeDms: false, closePosts: true });
  const old = await cases.submit(messageReport(g));
  const recent = await cases.submit(messageReport(g, { targetMessageId: "703", snapshot: snapshot({ messageId: "703" }) }));
  const open = await cases.submit(messageReport(g, { targetMessageId: "704", snapshot: snapshot({ messageId: "704" }) }));
  await cases.changeStatus(old.caseId, "resolve", "50", { now: new Date(now.getTime() - 31 * 86400000) });
  await cases.changeStatus(recent.caseId, "resolve", "50", { now: new Date(now.getTime() - 29 * 86400000) });

  await cases.submit(messageReport(left));
  await limits.block(left, "31", "50");
  await sqlStore.query("UPDATE tp_guilds SET left_at = ? WHERE guild_id = ?", [new Date(now.getTime() - 31 * 86400000), left]);
  const stillHere = newGuild();
  await cases.submit(messageReport(stillHere));
  await sqlStore.query("UPDATE tp_guilds SET left_at = ? WHERE guild_id = ?", [new Date(now.getTime() - 29 * 86400000), stillHere]);

  await retention.run({ now });
  assert.equal(await cases.byId(old.caseId), null, "closed 31 days ago with 30-day retention");
  assert.ok(await cases.byId(recent.caseId), "closed 29 days ago");
  assert.ok(await cases.byId(open.caseId), "open");
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_case_evidence WHERE case_id = ?", [old.caseId])).length, 0, "evidence goes with it");
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_guilds WHERE guild_id = ?", [left])).length, 0);
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_blocks WHERE guild_id = ?", [left])).length, 0);
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_cases WHERE guild_id = ?", [left])).length, 0);
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_guilds WHERE guild_id = ?", [stillHere])).length, 1, "left 29 days ago: kept");
  for (const id of [g, left, stillHere]) await wipe(id);
});

test("the snapshot survives the database round trip unchanged", options, async () => {
  const g = newGuild();
  const snap = evidence.fromMessage({ id: "600", channelId: "601", author: { id: "602", username: "someone" }, content: "emoji 🎉 and ünïcode", createdTimestamp: 1, attachments: new Map(), embeds: [] }, { reporterId: "1" }).snapshot;
  const { caseId } = await cases.submit(messageReport(g, { snapshot: snap }));
  assert.deepEqual(await cases.evidence(caseId), snap);
  await wipe(g);
});
