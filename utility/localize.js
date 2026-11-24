/**
 * Commands in every language Tipoff has, for Discord's command picker. The English text is the default; each
 * translation's own text goes in name_localizations / description_localizations. Slash command, subcommand and option
 * names stay English everywhere (/report, /setup...), so guides and moderators share one name; only the right-click
 * names, descriptions and choices are translated.
 *
 * pick is strings => text, for example s => s.commands.case.view.
 */

const en = require("../strings/en");
const { localizations } = require("../strings");

const any = map => Object.keys(map).length > 0;

/** setDescription (English) plus the translations, on any builder with them (command, subcommand, option). */
function describe(builder, pick) {
  builder.setDescription(pick(en));
  const map = localizations(pick);
  if (any(map)) builder.setDescriptionLocalizations(map);
  return builder;
}

/** setName plus the translations: for the right-click commands, whose names people see in the Apps menu. */
function named(builder, pick) {
  builder.setName(pick(en));
  const map = localizations(pick);
  if (any(map)) builder.setNameLocalizations(map);
  return builder;
}

/** A choice for addChoices, with its name in every language. */
function choice(pick, value) {
  const map = localizations(pick);
  return { name: pick(en), value, ...(any(map) ? { name_localizations: map } : {}) };
}

module.exports = { describe, named, choice };
