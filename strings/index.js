/**
 * Tipoff's languages. Every language is one file here, named by its Discord locale (de.js, es-419.js, pt-BR.js...),
 * shaped like en.js, with a `language` block saying which Discord locales it's for and who checked it. English (en.js)
 * is the source: any key a translation leaves out falls back to English, so a missing or partial file never breaks.
 *
 *   t(locale)                        that language's strings ("de", "pt-BR"...; unknown or empty = English)
 *   forUser(interaction)             the person's own Discord language: for replies only they see, forms and DMs
 *   serverLocale(settings, guild)    the server's language: its /setup language, else its Discord language, else English
 *   forServer(settings, guild)       strings in the server's language: for what's posted in the server
 *   localizations(pick)              { locale: text } from every translation that has its own text, for commands
 *   languages()                      [{ code, name, locales, status }], English first
 *
 * Which language for what:
 *   - anything only one person sees (forms, private replies, refusals): their own Discord language
 *   - anything posted in the server (case cards, forum post names and tags, alerts, audit log reasons): the server's
 *   - outcome DMs to reporters: the language each reporter used when they reported (saved with the report)
 */

const fs = require("node:fs");
const path = require("node:path");
const en = require("./en");

const ENGLISH = "en";
const FALLBACK_LOCALE = "en-GB";
const STATUSES = ["reviewed", "ours", "community"];
const NOT_LANGUAGES = new Set(["index.js", "plural.js"]);

// Discord's locales Tipoff aims to speak (https://docs.discord.com/developers/reference#locales). en-GB and en-US
// share en.js.
const TARGET_LOCALES = ["en-GB", "en-US", "de", "es-ES", "es-419", "fr", "it", "hu", "nl", "pl", "pt-BR", "ro", "sv-SE", "vi", "tr",
  "cs", "ru", "uk", "th", "zh-CN", "ja", "zh-TW", "ko"];

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** English, with every key the translation has put over it. Objects merge key by key; anything else is replaced. */
function merge(base, own) {
  if (!isPlainObject(own)) return base;
  const out = {};
  for (const key of Object.keys(base)) {
    if (!Object.hasOwn(own, key) || own[key] === undefined || own[key] === null) out[key] = base[key];
    else if (isPlainObject(base[key])) out[key] = merge(base[key], own[key]);
    else out[key] = own[key];
  }
  return out;
}

/** Every language file: Map code -> { code, file, raw }. English first. */
function load(dir = __dirname) {
  const files = new Map([[ENGLISH, { code: ENGLISH, file: "en.js", raw: en }]]);
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".js") || NOT_LANGUAGES.has(name) || name === "en.js") continue;
    const code = name.slice(0, -3);
    files.set(code, { code, file: name, raw: require(path.join(dir, name)) });
  }
  return files;
}

const FILES = load();
const byLocale = new Map();
for (const entry of FILES.values()) for (const locale of entry.raw.language?.locales || []) if (!byLocale.has(locale)) byLocale.set(locale, entry.code);
const merged = new Map();

/** The language file's code for a Discord locale, or English. */
function codeFor(locale) {
  return byLocale.get(String(locale || "")) || ENGLISH;
}

/** That language's strings, falling back to English key by key. */
function t(locale) {
  const code = codeFor(locale);
  if (!merged.has(code)) merged.set(code, code === ENGLISH ? en : merge(en, FILES.get(code).raw));
  return merged.get(code);
}

const forUser = interaction => t(interaction?.locale);

/** True if Tipoff has a language file for this Discord locale. */
const supported = locale => byLocale.has(String(locale || ""));

/**
 * The server's language as a Discord locale: the one chosen in /setup language, else the server's own Discord
 * language (Server Settings › Community), else English. A language without a file yet reads as English.
 */
function serverLocale(settings, guild) {
  if (settings?.language && supported(settings.language)) return settings.language;
  if (guild?.preferredLocale && supported(guild.preferredLocale)) return guild.preferredLocale;
  return FALLBACK_LOCALE;
}

const forServer = (settings, guild) => t(serverLocale(settings, guild));

/** [{ code, name, locales, status }] for every language file, English first. */
function languages() {
  return [...FILES.values()].map(({ code, raw }) => ({
    code, name: raw.language?.name || code, locales: [...(raw.language?.locales || [])], status: raw.language?.status || "ours"
  }));
}

/** "reviewed", "ours" or "community" for a locale's language. */
const status = locale => FILES.get(codeFor(locale)).raw.language?.status || "ours";

/**
 * For Discord's name_localizations / description_localizations: { locale: text } from each translation that has its
 * own text for it (never the English fallback). pick is strings => text, run on each file as written. Empty while
 * there are only English files.
 */
function localizations(pick) {
  const out = {};
  for (const entry of FILES.values()) {
    if (entry.code === ENGLISH) continue;
    let value;
    try {
      value = pick(entry.raw);
    } catch {
      value = undefined;
    }
    if (typeof value !== "string" || !value) continue;
    for (const locale of entry.raw.language?.locales || []) out[locale] = value;
  }
  return out;
}

module.exports = {
  ENGLISH, FALLBACK_LOCALE, STATUSES, TARGET_LOCALES, FILES,
  t, forUser, serverLocale, forServer, supported, codeFor, languages, status, localizations, merge, load
};
