/**
 * Who may run what. Every command, button, menu and modal names one of these levels, and the
 * check runs once, in events/interactionCreate.js, before any handler.
 *
 *   everyone       anyone in a server where Tipoff is
 *   moderator      the server's chosen moderator roles, or Manage Server / Administrator (phase 2 adds the roles;
 *                  until then it's Manage Server / Administrator only)
 *   manage_server  Manage Server or Administrator in that server (setting Tipoff up)
 *   staff          this copy's own staff (OWNER_IDS), for its staff commands. Nobody gets it from a server role.
 *
 * Discord's default_member_permissions only hides commands; servers can change who sees them in Server Settings →
 * Integrations. So Tipoff always checks again here, and never trusts that a command was hidden.
 */

const { PermissionFlagsBits } = require("discord.js");
const config = require("./config");

const LEVELS = { everyone: 1, moderator: 2, manage_server: 3, staff: 4 };

const isOwner = userId => Boolean(userId) && config.discord.ownerIds.includes(String(userId));

/** True if the member has Manage Server (Discord counts Administrator as having it too). */
function canManageServer(interaction) {
  return Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

/**
 * The highest level this interaction's user has, or null outside a server (Tipoff's commands are server-only).
 * moderatorRoleIds comes from the server's settings (phase 2).
 */
function levelOf(interaction, { moderatorRoleIds = [] } = {}) {
  if (isOwner(interaction.user?.id)) return "staff";
  if (!interaction.inGuild?.() || !interaction.member) return null;
  if (canManageServer(interaction)) return "manage_server";
  const roles = interaction.member.roles?.cache ?? new Map(
    (Array.isArray(interaction.member.roles) ? interaction.member.roles : []).map(id => [id, { id }])
  );
  if (moderatorRoleIds.some(id => roles.has?.(String(id)))) return "moderator";
  return "everyone";
}

/** True if `have` is at or above `need`. */
function atLeast(have, need) {
  return Boolean(have) && (LEVELS[have] || 0) >= LEVELS[need];
}

/**
 * What the install link asks for: only what Tipoff needs to post cases. Manage Channels (forum tags) and
 * the moderation actions' permissions are optional and never asked for up front. The README and the Developer
 * Portal's install settings use this number; tests/core.test.js keeps them in step.
 */
const INSTALL_PERMISSIONS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages
  | PermissionFlagsBits.SendMessagesInThreads | PermissionFlagsBits.CreatePublicThreads | PermissionFlagsBits.EmbedLinks
  | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.ReadMessageHistory;

module.exports = { LEVELS, INSTALL_PERMISSIONS, isOwner, canManageServer, levelOf, atLeast };
