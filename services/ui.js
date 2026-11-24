/**
 * Every message Tipoff sends is built here, in Components V2 (a container with an accent colour), so the look is the
 * same everywhere: Tipoff's orange for information, and the usual green, amber and red for outcomes. The case card
 * (phase 1) is built the same way.
 *
 * Mentions never ping unless a caller says so (allowedMentions is always set): quoting someone's message can't ping
 * @everyone or a role (their bug list, and plan 4.9).
 */

const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, MessageFlags
} = require("discord.js");
const config = require("./config");

const ACCENTS = {
  brand: config.colours.orange,
  success: 0x30a46c,
  warning: 0xf5a524,
  danger: 0xe5484d
};

// Discord's limit for all text in one Components V2 message
const TEXT_LIMIT = 4000;

function truncate(text, max) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * A message body: { sections: [string | null | "---"], buttons: [{ label, url }], accent, ephemeral }.
 * Each string becomes a text block; "---" is a divider; empty ones are skipped. Link buttons with no URL are skipped,
 * and the button row only appears if any are left.
 */
function card({ sections = [], buttons = [], accent = "brand", ephemeral = true } = {}) {
  const container = new ContainerBuilder().setAccentColor(ACCENTS[accent] ?? ACCENTS.brand);
  let used = 0;
  for (const section of sections) {
    if (!section) continue;
    if (section === "---") {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
      continue;
    }
    if (used >= TEXT_LIMIT) break;
    const text = truncate(section, TEXT_LIMIT - used);
    used += text.length;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  }

  const links = buttons.filter(button => button && button.url).slice(0, 5)
    .map(button => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(truncate(button.label, 80)).setURL(button.url));
  if (links.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(links));

  return {
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    components: [container],
    allowedMentions: { parse: [] }
  };
}

/** A short "couldn't do that" message. title: in the reader's language (English if left out). */
function error(text, title) {
  return card({ accent: "danger", sections: [`### ${title || require("../strings/en").errors.title}\n${text}`] });
}

/** Replies, edits or follows up, whatever state the interaction is in. */
async function reply(interaction, body) {
  if (interaction.deferred && !interaction.replied) {
    const { flags, ...rest } = body;
    // an edit can't change ephemerality; Components V2 must still be flagged
    return interaction.editReply({ ...rest, flags: flags & MessageFlags.IsComponentsV2 });
  }
  if (interaction.replied) return interaction.followUp(body);
  return interaction.reply(body);
}

module.exports = { ACCENTS, TEXT_LIMIT, card, error, reply, truncate };
