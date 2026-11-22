/**
 * The case card's buttons and menu, all for moderators:
 *
 *   case:claim:<id>  case:unclaim:<id>  case:reopen:<id>   change the status straight away
 *   case:resolve:<id>  case:dismiss:<id>                    open a form for an optional note
 *   case:close:<resolve|dismiss>:<id>                       that form, sent
 *   case:act:<id>                                           the Actions menu: opens the confirm form for the action
 *   case:do:<action>:<id>                                   that form, sent: checks again, then does it
 *
 * The case must belong to the server the button was pressed in, so a forged custom ID can't reach another server's case.
 */

const { MessageFlags } = require("discord.js");
const logger = require("../services/logger");
const cases = require("../services/cases");
const delivery = require("../services/delivery");
const receipts = require("../services/receipts");
const settingsStore = require("../services/settings");
const actions = require("../services/actions");
const m = require("../services/modals");
const ui = require("../services/ui");
const t = require("../strings/en");

const done = text => ui.card({ accent: "success", sections: [text] });
const refused = text => Object.assign(new Error(text), { userMessage: text });

async function load(interaction, id) {
  const c = /^\d+$/.test(String(id)) ? await cases.byId(id) : null;
  if (!c || String(c.guild_id) !== String(interaction.guildId)) throw refused(t.caseActions.refused.notFound);
  return c;
}

/** Re-renders the card after a change. A failure here never undoes the change. */
async function refresh(interaction, caseId) {
  try {
    await delivery.deliver(interaction.client, caseId);
  } catch (err) {
    logger.error(`Couldn't update the card for case ${caseId}: ${err.stack || err}`);
  }
}

function closeForm(action, c) {
  const ca = t.caseActions;
  return m.modal(`case:close:${action}:${c.id}`, action === "resolve" ? ca.resolveTitle(c.number) : ca.dismissTitle(c.number), [
    m.label(ca.closeNote, ca.closeNoteHint, m.textInput("note", { required: false, max: 1000 }))
  ]);
}

function actionForm(action, c) {
  const ca = t.caseActions;
  const reason = m.label(ca.reason, ca.reasonHint, m.textInput("reason", { style: m.TEXT.Short, required: false, max: 300 }));
  if (action === "timeout") {
    return m.modal(`case:do:timeout:${c.id}`, ca.timeoutTitle(c.number), [
      m.label(ca.duration, null, m.radio("duration", Object.entries(ca.durations).map(([value, label]) => ({ value, label })))),
      reason
    ]);
  }
  if (action === "delete") {
    return m.modal(`case:do:delete:${c.id}`, ca.deleteTitle(c.number), [
      m.label(ca.confirm, null, m.checkboxes("confirm", [{ value: "yes", label: ca.confirmDelete }]))
    ]);
  }
  const confirm = [{ value: "yes", label: action === "ban" ? ca.confirmBan : ca.confirmKick }];
  if (action === "ban") confirm.push({ value: "deleteMessages", label: ca.deleteMessages });
  return m.modal(`case:do:${action}:${c.id}`, action === "ban" ? ca.banTitle(c.number) : ca.kickTitle(c.number), [
    reason,
    m.label(ca.confirm, null, m.checkboxes("confirm", confirm))
  ]);
}

module.exports = {
  prefix: "case",
  level: "moderator",
  closeForm,
  actionForm,

  async execute(interaction, args) {
    const [step, first, second] = args;
    const ca = t.caseActions;

    if (step === "claim" || step === "unclaim" || step === "reopen") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const c = await load(interaction, first);
      if (step === "reopen" && cases.OPEN.includes(c.status)) throw refused(ca.refused.notClosed);
      if (step !== "reopen" && cases.CLOSED.includes(c.status)) throw refused(ca.refused.alreadyClosed);
      const changed = await cases.changeStatus(c.id, step, interaction.user.id);
      if (changed) await refresh(interaction, c.id);
      const text = { claim: ca.done.claimed, unclaim: ca.done.unclaimed, reopen: ca.done.reopened }[step](c.number);
      return ui.reply(interaction, done(text));
    }

    if (step === "resolve" || step === "dismiss") {
      const c = await load(interaction, first);
      if (cases.CLOSED.includes(c.status)) throw refused(ca.refused.alreadyClosed);
      return interaction.showModal(closeForm(step, c));
    }

    if (step === "close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = first === "dismiss" ? "dismiss" : "resolve";
      const c = await load(interaction, second);
      const note = m.reader(interaction).text("note") || null;
      const changed = await cases.changeStatus(c.id, action, interaction.user.id, { note });
      if (!changed) throw refused(ca.refused.alreadyClosed);
      await refresh(interaction, c.id);
      const after = await cases.byId(c.id);
      receipts.send(interaction.client, after, await settingsStore.get(c.guild_id), interaction.guild?.name)
        .catch(err => logger.warn(`Receipts for case ${c.id} failed: ${err.message}`));
      return ui.reply(interaction, done(action === "resolve" ? ca.done.resolved(c.number) : ca.done.dismissed(c.number)));
    }

    if (step === "act") {
      const action = interaction.values?.[0];
      const c = await load(interaction, first);
      if (cases.CLOSED.includes(c.status)) throw refused(ca.refused.alreadyClosed);
      // refuse straight away if they couldn't do it anyway, before asking them to confirm
      await actions.check(interaction, action, c);
      return interaction.showModal(actionForm(action, c));
    }

    if (step === "do") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = first;
      const c = await load(interaction, second);
      const values = m.reader(interaction);
      const confirm = values.checked("confirm");
      if (action !== "timeout" && !confirm.includes("yes")) throw refused(ca.refused.notConfirmed);
      const checked = await actions.check(interaction, action, c);
      const line = await actions.run(interaction, action, c, checked, {
        duration: Number(values.radio("duration")) || 3600,
        reason: values.text("reason") || null,
        deleteMessages: confirm.includes("deleteMessages")
      });
      await refresh(interaction, c.id);
      return ui.reply(interaction, done(line));
    }

    throw refused(t.errors.expired);
  }
};
