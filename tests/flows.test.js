/**
 * Whole flows through the real handlers, on the real test database with a fake Discord: right-click › Report Message,
 * send the form, then a moderator claims and resolves the case from the card, and the reporter gets the outcome.
 */

const { databaseTest } = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits: P } = require("discord.js");
const sqlStore = require("../services/sqlStore");
const settingsStore = require("../services/settings");
const cases = require("../services/cases");
const retention = require("../services/retention");
const reportMessage = require("../commands/reportMessage");
const reportComponent = require("../components/report");
const caseComponent = require("../components/case");
const events = require("../events/interactionCreate");
const cards = require("../services/cards");
const { fakeGuild, textChannel, fakeClient, permissionSet } = require("./fakeDiscord");

const options = databaseTest();
before(async () => { if (!options.skip) await sqlStore.setup(); });
after(() => sqlStore.close());

/** A fake interaction: records the modal shown and every reply. fields answers the sent form. */
function interaction(env, client, { userId, fields = {}, perms = [], extra = {} }) {
  const record = { modal: null, replies: [] };
  const i = {
    guildId: env.guild.id, guild: env.guild, client, user: { id: userId, username: `u${userId}` },
    channel: { name: "general" }, attachmentSizeLimit: 10485760, deferred: false, replied: false,
    inGuild: () => true, member: { id: userId, roles: { cache: new Map(), highest: { position: 5 } } },
    memberPermissions: permissionSet(perms),
    deferReply: async () => { i.deferred = true; },
    editReply: async body => { record.replies.push(body); },
    reply: async body => { i.replied = true; record.replies.push(body); },
    followUp: async body => { record.replies.push(body); },
    showModal: async modal => { record.modal = modal; },
    fields: {
      getTextInputValue: id => fields[id] ?? "",
      getRadioGroup: id => fields[id] ?? null,
      getCheckboxGroup: id => fields[id] ?? [],
      getUploadedFiles: () => new Map()
    },
    ...extra
  };
  return { i, record };
}

const text = body => cards.allText(body);

/** Empties one test server's rows, so a failed earlier run can't leave cool-downs or cases behind. */
async function clean(guildId) {
  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [guildId]);
  for (const table of retention.GUILD_TABLES) await sqlStore.query(`DELETE FROM ${table} WHERE guild_id = ?`, [guildId]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [guildId]);
}

test("report a message, then a moderator claims and resolves it, and the reporter is told", options, async () => {
  const env = fakeGuild({ guildId: "820000000000000001" });
  await clean(env.guild.id);
  const channel = textChannel(env);
  const client = fakeClient(env);
  const g = env.guild.id;
  await settingsStore.saveChannels(g, "50", { report: channel.id, urgentRole: "3", anonymous: true });
  await settingsStore.saveLimits(g, "50", { reporterCooldown: 2, maxOpen: 5, urgentCooldown: 10, retention: 90, outcomeDms: true, closePosts: true });

  // 1. right-click › Report Message: the form shows a preview, the server's reasons and both options
  const target = { id: "600", channelId: "601", author: { id: "602", username: "spammer" }, content: "free nitro https://scam.example", createdTimestamp: Date.now(), attachments: new Map(), embeds: [] };
  const open = interaction(env, client, { userId: "11", extra: { commandName: "Report Message", targetMessage: target } });
  await reportMessage.execute(open.i);
  const form = open.record.modal;
  assert.match(form.custom_id, /^report:[0-9a-f]{16}$/);
  assert.match(form.components[0].content, /Reporting a message/);
  assert.match(form.components[0].content, /`https:\/\/scam\.example`/, "the preview defangs links too");

  // 2. the form is sent: anonymous and urgent
  const [, draftId] = form.custom_id.split(":");
  const send = interaction(env, client, { userId: "11", fields: { reason: "Spam or scam", note: "they DM'd me too", options: ["urgent", "anonymous"] } });
  await reportComponent.execute(send.i, [draftId]);
  const receipt = text(send.record.replies.at(-1));
  assert.match(receipt, /Report #1 sent/);
  assert.match(receipt, /You'll get a DM/);
  assert.match(receipt, /reported anonymously/);
  assert.equal(env.log.sent.length, 1);
  const card = env.log.sent[0].body;
  assert.deepEqual(card.allowedMentions, { parse: [], roles: ["3"] });
  assert.ok(!text(card).includes("<@11>"), "the anonymous reporter isn't named");

  // a second person reports the same message: it joins case #1, the card is edited, the urgent role isn't pinged again
  const open2 = interaction(env, client, { userId: "12", extra: { targetMessage: target } });
  await reportMessage.execute(open2.i);
  const send2 = interaction(env, client, { userId: "12", fields: { reason: "Spam or scam", options: ["urgent"] } });
  await reportComponent.execute(send2.i, [open2.record.modal.custom_id.split(":")[1]]);
  assert.match(text(send2.record.replies.at(-1)), /Report #1 sent/);
  assert.equal(env.log.sent.length, 1, "no second card");
  assert.match(text(env.log.edited.at(-1).body), /2 reports/);

  // 3. a moderator (Manage Messages role, not Manage Server) claims it from the card
  await settingsStore.saveRoles(g, "50", { moderators: ["9"], staff: [] });
  const [row] = await sqlStore.query("SELECT id FROM tp_cases WHERE guild_id = ?", [g]);
  const mod = interaction(env, client, { userId: "50", extra: { customId: `case:claim:${row.id}`, isChatInputCommand: () => false, isContextMenuCommand: () => false, isAutocomplete: () => false, isButton: () => true, isAnySelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true } });
  mod.i.member.roles.cache.set("9", { id: "9" });
  await events.execute(mod.i, { commands: new Map(), components: new Map([["case", caseComponent]]) });
  assert.match(text(mod.record.replies.at(-1)), /claimed case #1/);
  assert.match(text(env.log.edited.at(-1).body), /Claimed by <@50>/);

  // someone without a moderator role is refused before the handler runs
  const member = interaction(env, client, { userId: "13", extra: { customId: `case:resolve:${row.id}`, isChatInputCommand: () => false, isContextMenuCommand: () => false, isAutocomplete: () => false, isButton: () => true, isAnySelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true } });
  await events.execute(member.i, { commands: new Map(), components: new Map([["case", caseComponent]]) });
  assert.match(text(member.record.replies.at(-1)), /only for this server's moderators/);

  // 4. resolved with a note: the card shows it, and both reporters get one DM each
  const close = interaction(env, client, { userId: "50", fields: { note: "Banned the account" } });
  await caseComponent.execute(close.i, ["close", "resolve", String(row.id)]);
  assert.match(text(close.record.replies.at(-1)), /Case #1 is resolved/);
  assert.match(text(env.log.edited.at(-1).body), /Resolved by <@50>/);
  await new Promise(resolve => setTimeout(resolve, 50)); // receipts are sent after the reply
  assert.deepEqual(env.log.dms.map(d => d.to).sort(), ["11", "12"]);
  assert.ok(env.log.dms.every(d => !text(d.body).includes("Banned")), "the note is never sent to reporters");

  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [g]);
  for (const table of retention.GUILD_TABLES) await sqlStore.query(`DELETE FROM ${table} WHERE guild_id = ?`, [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
});

test("reports about staff are escalated; refusals never save anything", options, async () => {
  const env = fakeGuild({ guildId: "820000000000000002" });
  await clean(env.guild.id);
  const report = textChannel(env);
  const escalation = textChannel(env);
  const client = fakeClient(env);
  const g = env.guild.id;

  // not set up yet: a clear refusal, and no draft saved
  const early = interaction(env, client, { userId: "11", extra: { targetMessage: { id: "1", channelId: "2", author: { id: "3" }, content: "x", attachments: new Map(), embeds: [] } } });
  await assert.rejects(reportMessage.execute(early.i), e => /aren't set up/.test(e.userMessage));
  assert.equal((await sqlStore.query("SELECT 1 FROM tp_report_drafts WHERE guild_id = ?", [g])).length, 0);

  await settingsStore.saveChannels(g, "50", { report: report.id, escalation: escalation.id, anonymous: false });
  env.guild._members.set("602", { id: "602", permissions: permissionSet([P.ManageGuild]), roles: { cache: new Map() } });
  const target = { id: "610", channelId: "601", author: { id: "602", username: "admin" }, content: "abuse", createdTimestamp: Date.now(), attachments: new Map(), embeds: [] };
  const open = interaction(env, client, { userId: "11", extra: { targetMessage: target } });
  await reportMessage.execute(open.i);
  const send = interaction(env, client, { userId: "11", fields: { reason: "Harassment or hate" } });
  await reportComponent.execute(send.i, [open.record.modal.custom_id.split(":")[1]]);
  assert.equal(env.log.sent.length, 1);
  assert.equal(env.log.sent[0].channelId, escalation.id, "out of the moderators' sight");
  assert.match(text(env.log.sent[0].body), /Escalated/);

  // the cool-down now stops the same reporter for 2 minutes
  const again = interaction(env, client, { userId: "11", extra: { targetMessage: { ...target, id: "611" } } });
  await assert.rejects(reportMessage.execute(again.i), e => /another in 2 minutes/.test(e.userMessage));

  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [g]);
  for (const table of retention.GUILD_TABLES) await sqlStore.query(`DELETE FROM ${table} WHERE guild_id = ?`, [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
});

test("a form sent after its draft expired says so plainly", options, async () => {
  const env = fakeGuild({ guildId: "820000000000000003" });
  await clean(env.guild.id);
  const channel = textChannel(env);
  const client = fakeClient(env);
  await settingsStore.saveChannels(env.guild.id, "50", { report: channel.id, anonymous: false });
  const send = interaction(env, client, { userId: "11", fields: { reason: "Other" } });
  await assert.rejects(reportComponent.execute(send.i, ["0123456789abcdef"]), e => /open too long/.test(e.userMessage));
  assert.equal((await cases.undelivered(env.guild.id)).length, 0);
  await sqlStore.query("DELETE FROM tp_audit WHERE guild_id = ?", [env.guild.id]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [env.guild.id]);
});
