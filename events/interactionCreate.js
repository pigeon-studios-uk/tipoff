/**
 * Every interaction comes through here, and the permission check runs here, once, before any handler
 * (services/permissions.js). A handler is never reached by someone below its level.
 *
 * Buttons, menus and modals are routed by the start of their custom ID ("case:..." goes to components/case.js). A
 * custom ID with no handler is answered as expired, so an old or forged one does nothing.
 */

const { Events } = require("discord.js");
const logger = require("../services/logger");
const ui = require("../services/ui");
const permissions = require("../services/permissions");
const extras = require("../utility/extras");
const t = require("../strings/en");

const DENIED = {
  everyone: t.errors.serverOnly,
  moderator: t.errors.needModerator,
  manage_server: t.errors.needManageServer,
  staff: t.errors.staffOnly
};

/**
 * { ok: true, level } or { ok: false, reason }. Exported for tests. The server's moderator roles are only read from
 * the database when they could make the difference (a "moderator" action by someone without Manage Server).
 */
async function authorise(interaction, need, {
  levelOf = permissions.levelOf,
  moderatorRoles = guildId => require("../services/settings").get(guildId).then(s => s.moderatorRoleIds)
} = {}) {
  let have = levelOf(interaction);
  if (!have) return { ok: false, reason: t.errors.serverOnly };
  if (need === "moderator" && have === "everyone") {
    have = levelOf(interaction, { moderatorRoleIds: await moderatorRoles(interaction.guildId) });
  }
  if (!permissions.atLeast(have, need)) return { ok: false, reason: DENIED[need] || t.errors.notAllowed };
  return { ok: true, level: have };
}

async function refuse(interaction, reason) {
  return ui.reply(interaction, ui.error(reason)).catch(() => {});
}

async function run(interaction, label, handler, need, call) {
  let decision;
  try {
    decision = await authorise(interaction, need);
  } catch (err) {
    // the moderator roles couldn't be read: refuse (never allow on an error)
    logger.error(`Couldn't check access for ${label}: ${err.stack || err}`);
    return refuse(interaction, t.errors.failed);
  }
  if (!decision.ok) {
    logger.warn(`Refused ${label} for ${interaction.user?.id} (needs ${need})`);
    return refuse(interaction, decision.reason);
  }
  try {
    await call();
  } catch (err) {
    if (err?.userMessage) return refuse(interaction, err.userMessage);
    logger.error(`${label} failed: ${err.stack || err}`);
    await refuse(interaction, t.errors.failed);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  authorise,
  DENIED,

  async execute(interaction, client) {
    if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
      const command = client.commands.get(interaction.commandName);
      // an extra (staff/) command anywhere but the staff server is treated as if it didn't exist
      if (!command || !extras.allowedHere(command, interaction)) return refuse(interaction, t.errors.unknownCommand);
      return run(interaction, `/${interaction.commandName}`, command, command.level, () => command.execute(interaction, client));
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete || !extras.allowedHere(command, interaction) || !(await authorise(interaction, command.level).catch(() => ({ ok: false }))).ok) return interaction.respond([]).catch(() => {});
      return Promise.resolve(command.autocomplete(interaction, client)).catch(err => {
        logger.warn(`Autocomplete for /${interaction.commandName} failed: ${err.message}`);
        return interaction.respond([]).catch(() => {});
      });
    }

    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const [prefix, ...args] = String(interaction.customId || "").split(":");
      const handler = client.components?.get(prefix);
      if (handler && extras.allowedHere(handler, interaction)) return run(interaction, `component ${prefix}`, handler, handler.level, () => handler.execute(interaction, args, client));
    }

    if (interaction.isRepliable()) return refuse(interaction, t.errors.expired);
  }
};
