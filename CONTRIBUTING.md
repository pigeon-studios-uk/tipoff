# Contributing to Tipoff

Thank you for helping. For bug reports, suggestions and code, see our [contributing guide](https://github.com/pigeon-studios-uk/.github/blob/main/CONTRIBUTING.md) first. This page is about translations.

## Translating Tipoff

Tipoff aims to speak every language Discord does, starting with these 22: English, German, Spanish (Spain), Spanish (Latin America), French, Italian, Hungarian, Dutch, Polish, Portuguese (Brazil), Romanian, Swedish, Vietnamese, Turkish, Czech, Russian, Ukrainian, Thai, Chinese (China), Japanese, Chinese (Taiwan) and Korean.

You don't need to know how to code. There are two ways to help:

- **Check or correct a translation.** Open the language's file in [`strings/`](strings), and either suggest changes in a pull request (the pencil icon on GitHub edits it in your browser) or open an issue saying which line and what it should say. A language whose file says `status: "ours"` or `"community"` hasn't been checked by a native speaker yet; if you're one and it reads well, say so, and it becomes `reviewed`.
- **Start a language.** Follow [Adding a language](README.md#adding-a-language) in the README. A partial file is fine: anything left out shows in English until someone fills it in.

### How to translate

- **Use Discord's own words.** Where Tipoff names something in Discord (Server Settings, Apps, Manage Server, Timeout Members, threads, forum posts, roles), use exactly what Discord calls it in your language. Switch your Discord language (User Settings › Language) and copy it from there.
- **Match Discord's tone.** Use the same formal or informal "you" Discord uses in your language, and keep it plain and friendly. Short is good: forms and buttons have tight limits.
- **Write for your region.** `es-419` is Latin American Spanish, not Spain's; `pt-BR` is Brazilian Portuguese; `zh-TW` is Traditional Chinese as used in Taiwan, not a converted `zh-CN`.
- **Keep a glossary** at the top of your file, as a comment: the words you chose for Tipoff's own terms (case, report, claim, resolve, dismiss, escalation, urgent), so everyone translating that language uses the same ones.
- **Keep the parts that aren't words.** `` `/setup channels` ``, links, `**bold**`, `-#` at the start of a line, and everything inside `${...}` must stay as they are. Slash command names (`/report`, `/setup`...) stay English in every language; their descriptions are translated.
- **Plurals:** write every form your language needs, `plural(n, { one: "# report", other: "# reports" })`, with `few` and `many` where your language has them.
- **Don't translate** the legal pages or the name Tipoff.

### Checking your work

`npm test` checks every language file and names any line with a problem: a key English doesn't have, a missing placeholder or plural form, a changed command or link, or text too long for Discord. If you can't run it, open the pull request anyway: GitHub runs the same checks.
