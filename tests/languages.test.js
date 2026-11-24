/**
 * Languages: the strings loader, plurals, which language is used for what, command translations, forum tags that
 * survive a language change, and the checks every language file must pass. The checks run over whatever files are in
 * strings/, so a translation added later is checked by `npm test` without changing anything here.
 */

const { databaseTest } = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Collection, Locale } = require("discord.js");
const strings = require("../strings");
const plural = require("../strings/plural");
const en = require("../strings/en");
const stats = require("../services/stats");
const forumTags = require("../services/forumTags");
const settingsStore = require("../services/settings");
const setupCheck = require("../services/setupCheck");
const reports = require("../services/reports");
const sqlStore = require("../services/sqlStore");
const cases = require("../services/cases");
const receipts = require("../services/receipts");
const setupCommand = require("../commands/setup");
const localize = require("../utility/localize");
const { loadCommands } = require("../utility/commandLoader");
const { fakeGuild, fakeClient } = require("./fakeDiscord");

const SLASH = ["help", "report", "setup", "case", "reports", "privacy"];

// --- the checks every language file must pass ---

/**
 * A stand-in for any argument a string function can get: a number (for plurals), text (toLowerCase works), or an
 * object whose fields are more of the same (setup.summary(s)). Shown as itself, so "⟦0⟧" in English must be in the
 * translation too.
 */
function arg(value) {
  return new Proxy({}, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => value;
      if (typeof key === "symbol") return undefined;
      if (typeof String.prototype[key] === "function") return String.prototype[key].bind(String(value));
      return arg(typeof value === "number" ? value : `${String(value).slice(0, -1)}.${key}⟧`);
    }
  });
}
const sentinels = n => Array.from({ length: n }, (_, i) => arg(`⟦${i}⟧`));
const placeholders = text => [...String(text).matchAll(/⟦[^⟧]*⟧/g)].map(m => m[0]).sort();
// commands, mentions and links must come through a translation unchanged
const codeSpans = text => [...String(text).matchAll(/`[^`]*`/g)].map(m => m[0]).sort();
const links = text => [...String(text).matchAll(/\]\(([^)]*)\)/g)].map(m => m[1]).sort();

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const kind = value => (typeof value === "function" ? "function" : Array.isArray(value) ? "list" : isObject(value) ? "group" : typeof value);

/** Every value in a strings object: [[path, value]]. */
function entries(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => (isObject(value) ? entries(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]));
}

/** Discord's limits, by key: what each text becomes in Discord. "*" is any key at that level. */
const LIMITS = [
  // modal titles
  [45, ["report.titles.*", "setup.channelsTitle", "setup.rolesTitle", "setup.reasonsTitle", "setup.limitsTitle", "setup.languageTitle",
    "caseActions.resolveTitle", "caseActions.dismissTitle", "caseActions.timeoutTitle", "caseActions.kickTitle", "caseActions.banTitle", "caseActions.deleteTitle"]],
  // labels in forms
  [45, ["report.reason", "report.note", "report.whatHappened", "report.details", "report.screenshots", "report.options",
    "setup.reportChannel", "setup.userChannel", "setup.escalationChannel", "setup.urgentRole", "setup.options", "setup.moderatorRoles",
    "setup.staffRoles", "setup.reasons", "setup.reporterCooldown", "setup.maxOpen", "setup.urgentCooldown", "setup.retention",
    "setup.limitOptions", "setup.language", "caseActions.closeNote", "caseActions.duration", "caseActions.reason", "caseActions.confirm"]],
  // descriptions under labels, and text box placeholders
  [100, ["report.reasonHint", "report.noteHint", "report.whatHappenedHint", "report.detailsHint", "report.screenshotsHint", "report.noteFor.*",
    "setup.reportChannelHint", "setup.userChannelHint", "setup.escalationChannelHint", "setup.urgentRoleHint", "setup.moderatorRolesHint",
    "setup.staffRolesHint", "setup.reasonsHint", "setup.languageHint", "setup.reporterCooldownHint", "setup.urgentCooldownHint", "caseActions.closeNoteHint", "caseActions.reasonHint"]],
  // options in radio groups, checkboxes and select menus: labels and descriptions
  [100, ["report.urgent", "report.anonymous", "report.urgentHint", "report.anonymousHint", "setup.anonymous", "setup.anonymousHint",
    "setup.outcomeDms", "setup.outcomeDmsHint", "setup.closePosts", "setup.languageAuto", "setup.languageUnreviewed", "language.name",
    "caseActions.durations.*", "caseActions.confirmKick", "caseActions.confirmBan", "caseActions.confirmDelete", "caseActions.deleteMessages",
    "card.actions.delete", "card.actions.timeout", "card.actions.kick", "card.actions.ban", "card.actions.deleteHint",
    "card.actions.timeoutHint", "card.actions.kickHint", "card.actions.banHint"]],
  // reasons are saved on cases, and a server's own can be up to 80 characters
  [80, ["defaultReasons.*", "otherReason"]],
  // buttons
  [80, ["card.buttons.claim", "card.buttons.unclaim", "card.buttons.resolve", "card.buttons.dismiss", "card.buttons.reopen", "card.buttons.jump", "help.buttons.*"]],
  // select menu placeholder
  [150, ["card.buttons.actions"]],
  // right-click command names
  [32, ["commands.reportMessage.name", "commands.reportUser.name"]],
  // command, subcommand and option descriptions, and choices
  [100, ["commands.*.description", "commands.setup.*", "commands.case.*", "commands.reports.*", "reportsView.periods.*"]],
  // forum tags
  [20, ["setup.tagNames.*"]]
];

function matches(pattern, path) {
  const a = pattern.split(".");
  const b = path.split(".");
  return a.length === b.length && a.every((part, i) => part === "*" || part === b[i]);
}

/** What a key's value becomes, to measure it: functions are called with long-ish stand-ins (case 99999...). */
function sample(value) {
  if (typeof value !== "function") return value;
  return value(...Array.from({ length: value.length }, () => arg(99999)));
}

/** Everything wrong with a language file, as readable lines (empty = all good). raw is the file as written. */
function problemsIn(raw, code) {
  const problems = [];
  const walk = (own, base, path) => {
    for (const [key, value] of Object.entries(own)) {
      const where = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(base, key)) {
        problems.push(`${where}: English has no such key`);
        continue;
      }
      const want = base[key];
      if (kind(value) !== kind(want)) {
        problems.push(`${where}: should be a ${kind(want)}, like English, not a ${kind(value)}`);
        continue;
      }
      if (isObject(value)) {
        walk(value, want, where);
      } else if (typeof value === "function") {
        if (value.length !== want.length) problems.push(`${where}: takes ${value.length} arguments; English takes ${want.length}`);
        let mine;
        let theirs;
        try {
          mine = value(...sentinels(want.length));
          theirs = want(...sentinels(want.length));
        } catch (err) {
          problems.push(`${where}: throws (${err.message})`);
          continue;
        }
        if (typeof mine !== "string") problems.push(`${where}: should give text`);
        else compare(where, mine, theirs);
      } else if (Array.isArray(value)) {
        if (value.length !== want.length) problems.push(`${where}: has ${value.length} items; English has ${want.length}`);
      } else if (typeof value === "string") {
        compare(where, value, want);
      }
    }
  };
  const compare = (where, mine, theirs) => {
    if (placeholders(mine).join() !== placeholders(theirs).join()) problems.push(`${where}: should use ${placeholders(theirs).join(", ") || "no placeholders"}, uses ${placeholders(mine).join(", ") || "none"}`);
    if (codeSpans(mine).join() !== codeSpans(theirs).join()) problems.push(`${where}: \`code\` must stay as in English (${codeSpans(theirs).join(" ") || "none"})`);
    if (links(mine).join() !== links(theirs).join()) problems.push(`${where}: links must stay as in English`);
    if (!mine.trim() && theirs.trim()) problems.push(`${where}: is empty`);
  };
  walk(raw, en, "");

  // the language block
  const meta = raw.language || {};
  if (typeof meta.name !== "string" || !meta.name) problems.push("language.name: missing");
  if (!strings.STATUSES.includes(meta.status)) problems.push(`language.status: must be one of ${strings.STATUSES.join(", ")}`);
  if (!Array.isArray(meta.locales) || !meta.locales.length) problems.push("language.locales: missing");
  for (const locale of meta.locales || []) {
    if (!Object.values(Locale).includes(locale)) problems.push(`language.locales: ${locale} isn't a Discord locale`);
    else if (!strings.TARGET_LOCALES.includes(locale)) problems.push(`language.locales: ${locale} isn't one of Tipoff's languages (strings/index.js, TARGET_LOCALES)`);
  }
  if (code !== strings.ENGLISH && !(meta.locales || []).includes(code)) problems.push(`the file should be named after one of its locales (${(meta.locales || []).join(", ")}.js)`);

  // slash command names stay English, in every language
  for (const name of SLASH) if (code !== strings.ENGLISH && raw.commands?.[name]?.name !== undefined) problems.push(`commands.${name}.name: slash command names stay English; leave it out`);

  // Discord's limits, on the language as people get it (with English filling the gaps)
  const merged = strings.merge(en, raw);
  for (const [path, value] of entries(merged)) {
    for (const [max, patterns] of LIMITS) {
      if (!patterns.some(pattern => matches(pattern, path))) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        const text = String(sample(item));
        if (text.length > max) problems.push(`${path}: ${text.length} characters; Discord allows ${max} here ("${text}")`);
      }
    }
  }

  // never the studio's name
  const everything = JSON.stringify(raw, (key, value) => (typeof value === "function" ? value(...sentinels(value.length)) : value));
  if (/pigeon/i.test(everything)) problems.push("names who makes Tipoff (Tipoff is its own brand)");
  return problems;
}

for (const { code, file, raw } of strings.FILES.values()) {
  test(`strings/${file} passes every check`, () => {
    assert.deepEqual(problemsIn(raw, code), []);
  });

  test(`strings/${file}: every plural has the forms its language needs, and every function runs with any number`, () => {
    plural.missing.clear();
    const t = strings.merge(en, raw);
    for (const [path, value] of entries(t)) {
      if (typeof value !== "function") continue;
      for (const n of [0, 1, 2, 3, 4, 5, 11, 12, 21, 22, 25, 101, 1000, 1.5]) {
        const out = value(...Array.from({ length: value.length }, () => arg(n)));
        assert.equal(typeof out, "string", `${path}(${n})`);
      }
    }
    assert.deepEqual([...plural.missing], []);
  });
}

test("the checks catch a broken translation", () => {
  const broken = {
    language: { name: "Test", locales: ["de"], status: "maybe" },
    commands: { report: { name: "melden" }, reportUser: { name: "Ein sehr langer Name für das Kontextmenü" } },
    nope: "x",
    report: { refused: { cooldown: () => "Später." }, previewMessage: (author, when) => `Von ${author}` },
    help: { reportOther: "» **Etwas anderes**: `/melden`" },
    setup: { tagNames: { open: "Ein viel zu langer Tag-Name" } },
    defaultReasons: ["Spam"]
  };
  const found = problemsIn(broken, "de").join("\n");
  for (const expected of [/nope: English has no such key/, /language.status/, /commands.report.name: slash command names stay English/,
    /commands.reportUser.name: \d+ characters; Discord allows 32/, /report.refused.cooldown: takes 0 arguments; English takes 1/,
    /report.refused.cooldown: should use ⟦0⟧/, /report.previewMessage: should use ⟦0⟧, ⟦1⟧/, /help.reportOther: `code` must stay/,
    /setup.tagNames.open: \d+ characters; Discord allows 20/, /defaultReasons: has 1 items; English has 5/]) {
    assert.match(found, expected);
  }
  assert.match(problemsIn({ ...broken, name: "Pigeon" }, "de").join("\n"), /names who makes Tipoff/);
});

test("Tipoff's languages are Discord's own locale codes, and no two files claim the same one", () => {
  for (const locale of strings.TARGET_LOCALES) assert.ok(Object.values(Locale).includes(locale), locale);
  assert.equal(new Set(strings.TARGET_LOCALES).size, 23, "22 languages; en-GB and en-US share English");
  const claimed = strings.languages().flatMap(lang => lang.locales);
  assert.equal(new Set(claimed).size, claimed.length);
  assert.deepEqual(strings.languages()[0], { code: "en", name: "English", locales: ["en-GB", "en-US"], status: "reviewed" });
});

// --- the loader ---

test("t(locale): a language without a file, or no locale at all, is English", () => {
  assert.equal(strings.t("en-US"), en);
  assert.equal(strings.t("en-GB"), en);
  assert.equal(strings.t("xx"), en);
  assert.equal(strings.t(undefined), en);
  assert.equal(strings.forUser({ locale: "ko" }), strings.forUser({}));
});

test("a partial translation falls back to English key by key, never breaking", () => {
  const partial = { language: { name: "Test" }, card: { status: { open: "Offen" } }, caseActions: { durations: { 600: "10 Minuten" } } };
  const t = strings.merge(en, partial);
  assert.equal(t.card.status.open, "Offen");
  assert.equal(t.card.status.claimed, "Claimed");
  assert.equal(t.caseActions.durations["600"], "10 Minuten");
  assert.equal(t.caseActions.durations["3600"], "1 hour");
  assert.equal(t.report.sent(4, false), en.report.sent(4, false));
  assert.equal(t.language.locales, en.language.locales);
});

test("the server's language: its /setup choice, else its Discord language, else English", () => {
  assert.equal(strings.serverLocale({ language: "en-US" }, { preferredLocale: "en-GB" }), "en-US");
  assert.equal(strings.serverLocale({ language: null }, { preferredLocale: "en-US" }), "en-US");
  // no file for German (yet): English, without forgetting the choice
  assert.equal(strings.serverLocale({ language: "de" }, { preferredLocale: "de" }), "en-GB");
  assert.equal(strings.serverLocale({}, null), "en-GB");
});

// --- plurals ---

test("plurals: English one and other; Polish few and many; Japanese no plural forms", () => {
  const english = plural("en-GB");
  assert.equal(english(1, { one: "# minute", other: "# minutes" }), "1 minute");
  assert.equal(english(2, { one: "# minute", other: "# minutes" }), "2 minutes");
  assert.equal(english(0, { one: "# minute", other: "# minutes" }), "0 minutes");
  assert.equal(en.report.refused.cooldown(1), "You've just sent a report. You can send another in 1 minute.");
  assert.equal(en.card.reports(3), "3 reports");

  const polish = plural("pl");
  const forms = { one: "# minuta", few: "# minuty", many: "# minut", other: "# minuty" };
  assert.deepEqual([1, 2, 5, 22, 25].map(n => polish(n, forms)), ["1 minuta", "2 minuty", "5 minut", "22 minuty", "25 minut"]);
  const japanese = plural("ja");
  assert.equal(japanese(1, { other: "#分" }), "1分");
  assert.equal(japanese(5, { other: "#分" }), "5分");

  plural.missing.clear();
  polish(5, { one: "# minuta", other: "# minuty" });
  assert.ok([...plural.missing].some(line => /no "many" form/.test(line)), "a missing form is noticed");
  plural.missing.clear();
  assert.throws(() => english(1, { one: "x" }), /need at least "other"/);
});

test("the stats' times come from the strings", () => {
  assert.equal(stats.duration(90), "2 min");
  assert.equal(stats.duration(5400), "1.5 h");
  assert.equal(stats.duration(3 * 86400), "3 days");
  const t = strings.merge(en, { reportsView: { durations: { minutes: n => `${n} Min.`, hours: n => `${n} Std.`, days: n => `${n} Tage` } } });
  assert.equal(stats.duration(90, t), "2 Min.");
  assert.equal(stats.duration(3 * 86400, t), "3 Tage");
});

// --- commands ---

const commands = new Collection(loadCommands().map(({ command }) => [command.data.name, command]));

test("slash command names stay English; with only English, there are no translations to send", () => {
  for (const name of SLASH) assert.ok(commands.has(name), name);
  for (const command of commands.values()) {
    const json = command.data.toJSON();
    assert.ok(!json.name_localizations || !Object.keys(json.name_localizations).length, json.name);
    if (strings.FILES.size === 1) assert.ok(!json.description_localizations || !Object.keys(json.description_localizations).length, json.name);
  }
  assert.ok(commands.get("setup").data.toJSON().options.some(o => o.name === "language"), "/setup language");
});

test("a translation's own text goes into the command's localizations, and English fills nothing in", () => {
  strings.FILES.set("de", { code: "de", file: "de.js", raw: { language: { name: "Deutsch", locales: ["de"], status: "ours" }, commands: { case: { view: "Einen Fall zeigen." }, reportUser: { name: "Mitglied melden" } }, reportsView: { periods: { 7: "7 Tage" } } } });
  try {
    const { ContextMenuCommandBuilder, SlashCommandSubcommandBuilder } = require("discord.js");
    const sub = localize.describe(new SlashCommandSubcommandBuilder().setName("view"), s => s.commands.case.view).toJSON();
    assert.equal(sub.description, "Show a case.");
    assert.deepEqual(sub.description_localizations, { de: "Einen Fall zeigen." });
    const note = localize.describe(new SlashCommandSubcommandBuilder().setName("note"), s => s.commands.case.note).toJSON();
    assert.equal(note.description_localizations, undefined, "no German text: no localization, so Discord shows English");
    const menu = localize.named(new ContextMenuCommandBuilder().setType(2), s => s.commands.reportUser.name).toJSON();
    assert.equal(menu.name, "Report User");
    assert.deepEqual(menu.name_localizations, { de: "Mitglied melden" });
    assert.deepEqual(localize.choice(s => s.reportsView.periods[7], 7), { name: "7 days", value: 7, name_localizations: { de: "7 Tage" } });
  } finally {
    strings.FILES.delete("de");
  }
});

// --- /setup ---

test("/setup language: the server's Discord language first, then one option per language file", () => {
  const settings = settingsStore.shape({ guild_id: "1" });
  const form = setupCommand.forms.language(settings, { guild: { preferredLocale: "en-US" } });
  assert.equal(form.custom_id, "setup:language");
  const select = form.components[0].component;
  assert.equal(select.type, 3);
  assert.deepEqual(select.options.map(o => o.value), ["auto", "en-GB"]);
  assert.equal(select.options[0].default, true);
  assert.match(select.options[0].label, /Discord language \(now English\)/);

  const chosen = setupCommand.forms.language(settingsStore.shape({ guild_id: "1", language: "en-US" }), {}).components[0].component;
  assert.deepEqual(chosen.options.filter(o => o.default).map(o => o.value), ["en-GB"], "en-US and en-GB are one choice");
});

test("/setup check shows the server's language", () => {
  const auto = setupCheck.summary(settingsStore.shape({ guild_id: "1" }), { guild: { preferredLocale: "en-US" } });
  assert.match(auto, /\*\*Language:\*\* The server's Discord language \(now English\)/);
  const chosen = setupCheck.summary(settingsStore.shape({ guild_id: "1", language: "en-GB" }));
  assert.match(chosen, /\*\*Language:\*\* English$/m);
});

test("report forms: labels in the reporter's language, values in the server's (what the case is saved under)", () => {
  const settings = settingsStore.shape({ guild_id: "1", report_channel_id: "2" });
  const reporter = strings.merge(en, { defaultReasons: ["Spam oder Betrug", "Belästigung", "NSFW", "Identitätsdiebstahl", "Regelverstoß"], otherReason: "Andere", report: { reason: "Grund" } });
  const form = reports.buildForm("user", settings, { customId: "report:x", strings: reporter, server: en });
  const reasons = form.components.find(c => c.component?.custom_id === "reason");
  assert.equal(reasons.label, "Grund");
  assert.deepEqual(reasons.component.options[0], { value: "Spam or scam", label: "Spam oder Betrug" });
  assert.deepEqual(reasons.component.options.at(-1), { value: "Other", label: "Andere" });
  // a server's own reasons are shown as they are
  const own = settingsStore.shape({ guild_id: "1" }, [], [{ position: 0, label: "Cheating" }]);
  const ownForm = reports.buildForm("user", own, { customId: "report:x", strings: reporter, server: en });
  assert.deepEqual(ownForm.components.find(c => c.component?.custom_id === "reason").component.options.map(o => o.label), ["Cheating", "Andere"]);
  // "Other" in either language is never kept as a reason of the server's own
  assert.deepEqual(settingsStore.parseReasons("Spam\nAndere\nOther", { strings: reporter }), ["Spam"]);
});

// --- forum tags ---

/** A forum, and a fake query that remembers tp_forum_tags rows. */
function tagEnv(availableTags, saved = []) {
  const rows = [...saved];
  const forum = {
    id: "700", availableTags, guild: { members: { me: {} } },
    permissionsFor: () => ({ has: () => true }),
    created: [],
    async setAvailableTags(list) {
      forum.availableTags = list.map((tag, i) => ({ ...tag, id: tag.id || `new${i}` }));
      forum.created.push(...list.filter(tag => !tag.id).map(tag => tag.name));
      return forum;
    }
  };
  const query = async (sql, params) => {
    if (/^SELECT/.test(sql)) return rows.filter(row => row.channel_id === params[0]);
    const [, channel_id, status, tag_id] = params;
    const old = rows.find(row => row.channel_id === channel_id && row.status === status);
    if (old) old.tag_id = tag_id;
    else rows.push({ channel_id, status, tag_id });
    return {};
  };
  return { forum, query, rows };
}

const englishTags = () => ["Open", "Claimed", "Resolved", "Dismissed", "Urgent"].map((name, i) => ({ id: `t${i}`, name }));
const german = strings.merge(en, { setup: { tagNames: { open: "Offen", claimed: "Übernommen", resolved: "Erledigt", dismissed: "Abgewiesen", urgent: "Dringend" } } });

test("forum tags: saved IDs win, whatever the tags are called now, so a language change never breaks a forum", async () => {
  // set up in English: found by name, and saved
  const env = tagEnv(englishTags());
  const first = await forumTags.ensure(env.forum, "1", { query: env.query });
  assert.deepEqual(first.tags, { open: "t0", claimed: "t1", resolved: "t2", dismissed: "t3", urgent: "t4" });
  assert.equal(env.rows.length, 5);

  // the admin renames a tag, then the server switches to German: the saved tags are still used, nothing is made
  env.forum.availableTags[0].name = "New reports";
  const after = await forumTags.ensure(env.forum, "1", { query: env.query, strings: german });
  assert.deepEqual(after.tags, first.tags);
  assert.deepEqual(after.missing, []);
  assert.deepEqual(env.forum.created, []);
});

test("forum tags: unsaved tags are found by name (the server's language, then English); missing ones are made in the server's language", async () => {
  const env = tagEnv([{ id: "a", name: "open" }, { id: "b", name: "Erledigt" }]);
  const result = await forumTags.ensure(env.forum, "1", { query: env.query, strings: german });
  assert.equal(result.tags.open, "a", "English name, any case");
  assert.equal(result.tags.resolved, "b", "German name");
  assert.deepEqual(env.forum.created.sort(), ["Abgewiesen", "Dringend", "Übernommen"]);

  // a saved tag that was deleted from the forum is found again or made again
  const gone = tagEnv([{ id: "x", name: "Urgent" }], [{ channel_id: "700", status: "urgent", tag_id: "deleted" }]);
  const again = await forumTags.ensure(gone.forum, "1", { query: gone.query });
  assert.equal(again.tags.urgent, "x");
});

// --- saved languages (database) ---

const options = databaseTest();
before(async () => { if (!options.skip) await sqlStore.setup(); });
after(() => sqlStore.close());

test("the server language is saved by /setup language; one Tipoff has no file for is not", options, async () => {
  const g = "830000000000000001";
  await sqlStore.query("DELETE FROM tp_audit WHERE guild_id = ?", [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
  assert.equal((await settingsStore.get(g)).language, null);
  assert.equal(await settingsStore.saveLanguage(g, "50", "en-US"), "en-US");
  assert.equal((await settingsStore.get(g)).language, "en-US");
  assert.equal(await settingsStore.saveLanguage(g, "50", "xx-XX"), null);
  assert.equal((await settingsStore.get(g)).language, null);
  const [audit] = await sqlStore.query("SELECT COUNT(*) AS n FROM tp_audit WHERE guild_id = ? AND action = 'setup.language'", [g]);
  assert.equal(Number(audit.n), 2);
  await sqlStore.query("DELETE FROM tp_audit WHERE guild_id = ?", [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
});

test("each reporter's language is saved with their report, and their outcome DM uses it", options, async () => {
  const env = fakeGuild({ guildId: "830000000000000002" });
  const g = env.guild.id;
  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
  const report = { guildId: g, kind: "user", reason: "Spam or scam", snapshot: {}, targetUserId: "602", anonymous: false, urgent: false, note: null, escalated: false };
  const saved = await cases.submit({ ...report, reporterId: "11", locale: "en-US" });
  await cases.submit({ ...report, reporterId: "12", locale: "not a locale!" });
  const reps = await cases.reporters(saved.caseId);
  assert.deepEqual(reps.map(r => r.locale), ["en-US", null]);

  // each DM is in that reporter's language (both English here; an unknown or missing one is English too)
  await cases.changeStatus(saved.caseId, "resolve", "50");
  const sent = await receipts.send(fakeClient(env), await cases.byId(saved.caseId), { outcomeDms: true }, "Test Server");
  assert.equal(sent, 2);
  assert.ok(env.log.dms.every(dm => /Your report \*\*#1\*\* in \*\*Test Server\*\* was reviewed/.test(JSON.stringify(dm.body))));
  await sqlStore.query("DELETE FROM tp_cases WHERE guild_id = ?", [g]);
  await sqlStore.query("DELETE FROM tp_guilds WHERE guild_id = ?", [g]);
});
