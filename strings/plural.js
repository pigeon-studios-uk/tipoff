/**
 * Plurals for any language, built on Intl.PluralRules. Each language file makes its own:
 *
 *   const plural = require("./plural")("pl");
 *   plural(n, { one: "# minuta", few: "# minuty", many: "# minut", other: "# minuty" })
 *
 * "#" is replaced by the number. The forms are Intl's categories (zero, one, two, few, many, other); "other" is always
 * needed, and is used for any category a language file leaves out. English needs one and other; Polish, Czech,
 * Russian and Ukrainian use few and many as well; Chinese, Japanese, Korean, Thai and Vietnamese only other.
 *
 * A form that falls back to "other" is noted in plural.missing, so the tests can name a language file that forgot one.
 * Only the forms whole numbers up to 1,000 can need are required: Tipoff counts reports, minutes and days, so the
 * "many" that Spanish, French, Italian and Portuguese use only for millions (and Czech for fractions) is optional.
 */

const NEEDED_UP_TO = 1000;

const missing = new Set();

function forLanguage(locale) {
  const rules = new Intl.PluralRules(locale);
  const needed = new Set();
  for (let n = 0; n <= NEEDED_UP_TO; n++) needed.add(rules.select(n));
  return function plural(n, forms) {
    if (!forms || typeof forms.other !== "string") throw new Error(`plural(${n}): the forms need at least "other"`);
    const number = Number(n);
    const category = Number.isFinite(number) ? rules.select(number) : "other";
    for (const c of needed) if (typeof forms[c] !== "string") missing.add(`${locale}: "${forms.other}" has no "${c}" form`);
    const form = typeof forms[category] === "string" ? forms[category] : forms.other;
    return form.replace(/#/g, String(n));
  };
}

module.exports = forLanguage;
module.exports.missing = missing;
