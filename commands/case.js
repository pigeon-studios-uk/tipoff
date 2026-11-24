const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ApplicationIntegrationType, MessageFlags } = require("discord.js");
const cases = require("../services/cases");
const delivery = require("../services/delivery");
const { defang, quote } = require("../services/evidence");
const ui = require("../services/ui");
const strings = require("../strings");
const en = require("../strings/en");
const { describe } = require("../utility/localize");

const ts = value => `<t:${Math.floor(new Date(value).getTime() / 1000)}:R>`;
const refused = text => Object.assign(new Error(text), { userMessage: text });

/** /case view: the whole case, with every reporter (anonymous ones stay anonymous) and the timeline, in t's language. */
function caseView(c, reps, evs, t = en) {
  const v = t.caseView;
  const cardLink = c.card_channel_id && c.card_message_id ? `https://discord.com/channels/${c.guild_id}/${c.card_channel_id}/${c.card_message_id}` : null;
  const reporters = reps.map(r => `${Number(r.anonymous) ? `**${t.card.anonymous}**` : `<@${r.reporter_id}>`} · ${ts(r.updated_at || r.created_at)}${r.note ? `\n${quote(defang(String(r.note).slice(0, 300)))}` : ""}`);
  const timeline = evs.filter(e => e.action !== "note").slice(-15).map(e => `${ts(e.created_at)} · ${t.caseActions.events[e.action] || e.action}${e.actor_id ? ` · <@${e.actor_id}>` : ""}${e.detail ? ` · ${defang(String(e.detail).slice(0, 200))}` : ""}`);
  const notes = evs.filter(e => e.action === "note").map(e => `<@${e.actor_id}> · ${ts(e.created_at)}\n${quote(defang(String(e.detail || "")))}`);
  return ui.card({
    sections: [
      `${v.title(c.number, t.card.kinds[c.kind], c.reason, t.card.status[c.status])}\n${cardLink ? v.card(cardLink) : v.noCard}`,
      "---",
      `**${v.reporters}**\n${reporters.join("\n")}`,
      notes.length ? `**${v.notes}**\n${notes.join("\n")}` : null,
      `**${v.events}**\n${timeline.join("\n")}`
    ]
  });
}

module.exports = {
  level: "moderator",
  caseView,

  data: describe(new SlashCommandBuilder().setName(en.commands.case.name), s => s.commands.case.description)
    // who sees it by default; servers can change this in Server Settings › Integrations. Tipoff checks moderator roles itself.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub => describe(sub.setName("view"), s => s.commands.case.view)
      .addIntegerOption(o => describe(o.setName("number"), s => s.commands.case.number).setRequired(true).setMinValue(1)))
    .addSubcommand(sub => describe(sub.setName("note"), s => s.commands.case.note)
      .addIntegerOption(o => describe(o.setName("number"), s => s.commands.case.number).setRequired(true).setMinValue(1))
      .addStringOption(o => describe(o.setName("text"), s => s.commands.case.text).setRequired(true).setMaxLength(1000)))
    .addSubcommand(sub => describe(sub.setName("reopen"), s => s.commands.case.reopen)
      .addIntegerOption(o => describe(o.setName("number"), s => s.commands.case.number).setRequired(true).setMinValue(1))),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const t = strings.forUser(interaction);
    const c = await cases.byNumber(interaction.guildId, interaction.options.getInteger("number"));
    if (!c) throw refused(t.caseActions.refused.notFound);

    if (sub === "view") return ui.reply(interaction, caseView(c, await cases.reporters(c.id), await cases.events(c.id), t));

    if (sub === "note") {
      await cases.addEvent(c.id, interaction.user.id, "note", interaction.options.getString("text"));
      return ui.reply(interaction, ui.card({ accent: "success", sections: [t.caseActions.done.noted(c.number)] }));
    }

    if (!cases.CLOSED.includes(c.status)) throw refused(t.caseActions.refused.notClosed);
    await cases.changeStatus(c.id, "reopen", interaction.user.id);
    await delivery.deliver(interaction.client, c.id).catch(() => {});
    return ui.reply(interaction, ui.card({ accent: "success", sections: [t.caseActions.done.reopened(c.number)] }));
  }
};
