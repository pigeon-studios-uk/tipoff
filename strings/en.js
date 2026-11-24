/**
 * Every word Tipoff shows people, in English (UK). This is the source every other language file is checked against:
 * a translation has only keys this file has, and any key it leaves out falls back to the English here. See README.md
 * (Languages) for how to add one. Plain words, no jargon; Tipoff is its own brand, so nothing here names who makes it.
 *
 * Plurals: plural(n, { one: "# minute", other: "# minutes" }), "#" being the number (strings/plural.js).
 */

const plural = require("./plural")("en-GB");

module.exports = {
  // which Discord languages this file is for, and who checked it: "reviewed" (by a native speaker), "ours" (our own
  // translation) or "community" (sent in, not yet checked). English is the source, so it's reviewed.
  language: {
    name: "English",
    locales: ["en-GB", "en-US"],
    status: "reviewed",
    // shown under messages in a language that isn't reviewed yet
    unreviewed: link => `-# This translation hasn't been checked by a native speaker yet. [Help improve it](${link}).`
  },

  name: "Tipoff",
  tagline: "Reports your moderators can act on.",

  // The reasons in every report form until a server sets its own (/setup reasons). "Other" is always added last.
  defaultReasons: ["Spam or scam", "Harassment or hate", "NSFW or graphic", "Impersonation", "Rule breaking"],
  otherReason: "Other",

  commands: {
    help: { name: "help", description: "How to report something, and how to set Tipoff up." },
    reportMessage: { name: "Report Message" },
    reportUser: { name: "Report User" },
    report: { name: "report", description: "Report something to this server's moderators." },
    setup: {
      name: "setup", description: "Set Tipoff up for this server.",
      channels: "Where reports go, the urgent role, and anonymous reports.",
      roles: "Who counts as a moderator, and whose reports go to the escalation channel.",
      reasons: "The reasons people pick from when they report.",
      limits: "Cool-downs, limits, telling reporters the outcome, and how long cases are kept.",
      language: "The language Tipoff posts in here: case cards, forum tags and alerts.",
      check: "Show the settings and check Tipoff can post where it needs to."
    },
    case: {
      name: "case", description: "Look at or change a case.",
      view: "Show a case.", note: "Add a private note to a case.", reopen: "Reopen a closed case.",
      number: "The case number", text: "Your note"
    },
    reports: {
      name: "reports", description: "Reports in this server.",
      user: "Every case about a member.", stats: "How reports are going in this server.",
      block: "Stop someone sending reports here.", unblock: "Let someone send reports here again.",
      member: "The member", reason: "Why (only moderators see it)", period: "How far back"
    },
    privacy: { name: "privacy", description: "What Tipoff keeps about you in this server, and how to get it deleted." }
  },

  help: {
    title: "Tipoff",
    reportHeading: "Report something",
    reportMessage: "» **A message**: right-click it › **Apps** › **Report Message**",
    reportUser: "» **A member**: right-click them › **Apps** › **Report User**",
    reportOther: "» **Anything else**: `/report`",
    adminHeading: "For admins",
    adminSetup: "» `/setup channels` chooses where reports go; `/setup check` checks everything works.",
    discordSafety: url => `-# Something that breaks Discord's own rules? Report it to Discord too: [how to report to Discord](${url}).`,
    buttons: { guide: "Guide", privacy: "Privacy", support: "Support server", website: "Website" }
  },

  report: {
    titles: { message: "Report message", user: "Report member", general: "Report something" },
    reason: "Reason",
    reasonHint: "Pick the closest",
    note: "Anything else the moderators should know?",
    noteHint: "Optional",
    noteFor: { message: "Why are you reporting this message?", user: "What did they do?" },
    whatHappened: "What happened?",
    whatHappenedHint: "Be as clear as you can",
    details: "What are you reporting?",
    detailsHint: "Be as clear as you can: who, where, when",
    screenshots: "Screenshots",
    screenshotsHint: "Up to 5 images (optional)",
    options: "Options",
    urgent: "Ping the moderators",
    urgentHint: "For something that needs them now. Please use it wisely.",
    anonymous: "Report anonymously",
    anonymousHint: "Moderators won't see your name. Tipoff keeps it only to stop abuse.",
    discordSafety: url => `-# Something that breaks Discord's own rules? Report it to Discord too: [how to report to Discord](${url}).`,
    previewMessage: (author, when) => `### Reporting a message\nBy ${author} · ${when}`,
    previewNoText: "-# (no text)",
    previewAttachments: n => `-# ${plural(n, { one: "# attachment", other: "# attachments" })}`,
    previewUser: (user, created, joined) => `### Reporting ${user}\n-# Account made ${created}${joined ? ` · joined ${joined}` : ""}`,
    sent: (number, outcomeDms) => `### Report #${number} sent\nThe moderators will look at it.${outcomeDms ? "\nYou'll get a DM when it's been dealt with." : ""}`,
    sentAnonymous: "-# You reported anonymously: the moderators won't see your name.",
    urgentCoolingDown: "-# The moderators were pinged a few minutes ago, so they weren't pinged again. Your report is marked urgent.",
    notDelivered: "-# Your report is saved, but Tipoff couldn't post it yet. The server's admins have been told.",
    refused: {
      self: "You can't report yourself.",
      ownMessage: "You can't report your own message.",
      bot: "That's Tipoff itself.",
      notSetUp: "Reports aren't set up in this server yet. Ask an admin to run `/setup channels`.",
      blocked: "You can't send reports in this server.",
      cooldown: minutes => `You've just sent a report. You can send another in ${plural(minutes, { one: "# minute", other: "# minutes" })}.`,
      tooManyOpen: n => `You already have ${plural(n, { one: "# open report", other: "# open reports" })} here. Please wait for the moderators to deal with them.`,
      gone: "That couldn't be loaded any more. It may have been deleted.",
      expired: "This form was open too long. Please start the report again.",
      empty: "Please say what you're reporting."
    }
  },

  card: {
    kinds: { message: "Message reported", user: "Member reported", general: "Report" },
    status: { open: "Open", claimed: "Claimed", resolved: "Resolved", dismissed: "Dismissed" },
    reports: n => plural(n, { one: "# report", other: "# reports" }),
    urgent: role => `${role} · urgent report`,
    urgentNoRole: "Urgent report",
    escalated: "Escalated: this is about a member of staff",
    escalatedFallback: "-# No escalation channel is set, so this staff report is here. `/setup channels` can add one.",
    noText: "-# (no text)",
    by: (who, when, where) => `By ${who} · ${when}${where ? ` · in ${where}` : ""}`,
    forwarded: "forwarded",
    edited: "edited",
    webhook: name => `**${name}** (webhook)`,
    app: user => `${user} (via an app command)`,
    bot: user => `${user} (bot)`,
    reply: who => `Replying to ${who}`,
    embeds: "Embeds",
    stickers: names => `Stickers: ${names}`,
    poll: question => `Poll: ${question}`,
    tooBig: links => `-# Too big to copy: ${links}`,
    linksNote: "-# Links are shown as text so they can't be clicked by accident.",
    memberDates: (created, joined) => `Account made ${created}${joined ? ` · joined ${joined}` : ""}`,
    roles: list => `Roles: ${list}`,
    timedOut: until => `Timed out until ${until}`,
    leftServer: "Not in the server any more",
    history: (total, resolved, dismissed) => total
      ? `History: ${plural(total, { one: "# earlier case", other: "# earlier cases" })} about them (${resolved} resolved, ${dismissed} dismissed)`
      : "History: no earlier cases about them",
    earlier: (number, status) => `Earlier: #${number}, ${status.toLowerCase()}`,
    reportersHeading: "Reporters",
    anonymous: "Anonymous",
    noNote: "(no note)",
    moreReporters: (n, number) => `… and ${n} more (\`/case view number:${number}\`)`,
    claimedBy: (who, when) => `Claimed by ${who} · ${when}`,
    closedBy: (status, who, when) => `${status} by ${who} · ${when}`,
    note: text => `> ${text}`,
    reposted: "-# The first card was deleted, so this one was posted from the saved copy.",
    buttons: { claim: "Claim", unclaim: "Unclaim", resolve: "Resolve", dismiss: "Dismiss", reopen: "Reopen", jump: "Jump to message", actions: "Actions…" },
    actions: {
      delete: "Delete the message", timeout: "Time out", kick: "Kick", ban: "Ban",
      deleteHint: "The saved copy stays on the case", timeoutHint: "10 minutes to 1 week", kickHint: "They can rejoin with an invite", banHint: "They can't rejoin",
      missing: perm => `Tipoff needs ${perm} for this`
    },
    threadName: (number, who, reason) => `#${number} · ${who} · ${reason}`,
    // the forum post's name when the member's or author's name is unknown
    threadFallback: { user: "member", message: "message" }
  },

  caseActions: {
    resolveTitle: number => `Resolve case #${number}`,
    dismissTitle: number => `Dismiss case #${number}`,
    closeNote: "Note (optional)",
    closeNoteHint: "What was done. Reporters never see it.",
    timeoutTitle: number => `Time out (case #${number})`,
    kickTitle: number => `Kick (case #${number})`,
    banTitle: number => `Ban (case #${number})`,
    deleteTitle: number => `Delete the message (case #${number})`,
    duration: "How long",
    durations: { "600": "10 minutes", "3600": "1 hour", "86400": "1 day", "604800": "1 week" },
    reason: "Reason",
    reasonHint: "Shown in the case and in Discord's audit log",
    confirm: "Confirm",
    confirmKick: "Yes, kick them",
    confirmBan: "Yes, ban them",
    confirmDelete: "Yes, delete the message",
    deleteMessages: "Also delete their messages from the last day",
    auditReason: (number, by, reason) => `Tipoff case #${number}, by ${by}${reason ? `: ${reason}` : ""}`,
    done: {
      claimed: number => `You've claimed case #${number}.`,
      unclaimed: number => `Case #${number} is unclaimed.`,
      resolved: number => `Case #${number} is resolved.`,
      dismissed: number => `Case #${number} is dismissed.`,
      reopened: number => `Case #${number} is open again.`,
      deleted: "The message is deleted. The saved copy stays on the case.",
      timedOut: (who, duration) => `${who} is timed out for ${duration}.`,
      kicked: who => `${who} has been kicked.`,
      banned: who => `${who} has been banned.`,
      noted: number => `Note added to case #${number}.`
    },
    refused: {
      notFound: "That case doesn't exist in this server.",
      alreadyClosed: "That case is already closed.",
      notClosed: "That case is still open.",
      youNeed: perm => `You need **${perm}** to do that.`,
      tipoffNeeds: perm => `Tipoff needs **${perm}** to do that.`,
      higherRole: "You can't do that to someone whose highest role is the same as or above yours.",
      tipoffLower: "Tipoff's role has to be above theirs to do that. Move Tipoff's role up in Server Settings › Roles.",
      owner: "You can't do that to the server owner.",
      notAMember: "They're not in the server any more.",
      messageGone: "That message has already been deleted.",
      escalated: "This case is about a member of staff. Only someone above them can act on it.",
      notConfirmed: "Nothing was done: you didn't tick the confirm box."
    },
    events: {
      opened: "opened", joined: "report added", claimed: "claimed", unclaimed: "unclaimed", resolved: "resolved", dismissed: "dismissed",
      reopened: "reopened", note: "note", deleted: "message deleted", timeout: "timed out", kick: "kicked", ban: "banned",
      reposted: "card re-posted", delivered: "delivered"
    }
  },

  receipts: {
    resolved: (number, server) => `Your report **#${number}** in **${server}** was reviewed, and the moderators took action. Thank you for reporting it.`,
    dismissed: (number, server) => `Your report **#${number}** in **${server}** was reviewed. The moderators decided no action was needed this time. Thank you for reporting it.`,
    footer: "-# You're getting this because this server tells reporters the outcome. Tipoff never says what action was taken, or about whom."
  },

  setup: {
    channelsTitle: "Tipoff: where reports go",
    reportChannel: "Report channel",
    reportChannelHint: "Where reports go: a text channel, thread or forum",
    userChannel: "Member reports channel",
    userChannelHint: "Optional: member reports go here instead",
    escalationChannel: "Escalation channel",
    escalationChannelHint: "Optional: reports about staff go here, out of staff's sight",
    urgentRole: "Urgent role",
    urgentRoleHint: "Optional: the role reporters can ping for urgent reports",
    options: "Options",
    anonymous: "Allow anonymous reports",
    anonymousHint: "Moderators won't see who sent them; Tipoff still enforces limits",
    rolesTitle: "Tipoff: moderators and staff",
    moderatorRoles: "Moderator roles",
    moderatorRolesHint: "Can see, claim and close cases. Manage Server always can.",
    staffRoles: "Staff roles",
    staffRolesHint: "Reports about these members go to the escalation channel",
    reasonsTitle: "Tipoff: report reasons",
    reasons: "Reasons, one per line",
    reasonsHint: `Up to 9. "Other" is always added at the end.`,
    limitsTitle: "Tipoff: limits and privacy",
    reporterCooldown: "Minutes between reports (0 to 30)",
    reporterCooldownHint: "For each member",
    maxOpen: "Most open reports per member (1 to 20)",
    urgentCooldown: "Minutes between urgent pings (0 to 60)",
    urgentCooldownHint: "For the whole server",
    retention: "Days to keep closed cases (30 to 365)",
    limitOptions: "Options",
    outcomeDms: "Tell reporters the outcome by DM",
    outcomeDmsHint: "Never says what action was taken, or about whom",
    closePosts: "Close forum posts when a case is closed",
    languageTitle: "Tipoff: language",
    language: "Language for this server",
    languageHint: "For case cards, forum tags and alerts. Members still see their own language.",
    languageAuto: name => `The server's Discord language (now ${name})`,
    languageUnreviewed: "Not checked by a native speaker yet",
    saved: "### Saved\nYour settings are saved. Here's how they look:",
    nothingChanged: "-# Nothing was changed.",
    invalidNumber: (label, min, max) => `**${label}** must be a whole number from ${min} to ${max}.`,
    tooManyReasons: `You can have up to 9 reasons ("Other" is added for you).`,
    reasonTooLong: "Each reason can be up to 80 characters.",
    noReasons: "Add at least one reason, or clear the box to use the defaults.",
    channelGone: channel => `${channel} can't be found. It may have been deleted.`,
    notNeeded: "-# (not set)",
    summary: s => [
      `**Reports go to:** ${s.report}`,
      `**Member reports go to:** ${s.user}`,
      `**Reports about staff go to:** ${s.escalation}`,
      `**Urgent role:** ${s.urgentRole}`,
      `**Moderator roles:** ${s.moderators}`,
      `**Staff roles:** ${s.staff}`,
      `**Anonymous reports:** ${s.anonymous ? "allowed" : "off"}`,
      `**Reasons:** ${s.reasons}`,
      `**Between reports:** ${plural(s.reporterCooldown, { one: "# minute", other: "# minutes" })} · **Most open reports each:** ${s.maxOpen} · **Between urgent pings:** ${plural(s.urgentCooldown, { one: "# minute", other: "# minutes" })}`,
      `**Language:** ${s.language}`,
      `**Tell reporters the outcome:** ${s.outcomeDms ? "yes" : "no"} · **Close forum posts when done:** ${s.closePosts ? "yes" : "no"} · **Keep closed cases:** ${plural(s.retention, { one: "# day", other: "# days" })}`
    ].join("\n"),
    checkTitle: "### Tipoff check",
    checkOk: "Everything's ready. Members can report with right-click › **Apps**, or `/report`.",
    checkProblems: "Fix these so reports reach your moderators:",
    redelivered: n => `-# ${plural(n, { one: "# waiting report", other: "# waiting reports" })} posted now.`,
    stillWaiting: n => `-# ${plural(n, { one: "# report", other: "# reports" })} still waiting to be posted.`,
    problems: {
      noChannel: "No report channel yet: run `/setup channels`.",
      missingChannel: (what, id) => `The ${what} (<#${id}>) can't be found. Pick another with \`/setup channels\`.`,
      missingPerms: (channel, perms) => `In ${channel}, Tipoff needs: ${perms}.`,
      noTags: (channel, tags) => `${channel} is a forum, and Tipoff can't make its status tags (it needs Manage Channels there). Either let it, or add these tags yourself: ${tags}.`,
      urgentRoleGone: "The urgent role was deleted; reporters can't ping anyone. Pick another with `/setup channels`, or leave it empty.",
      urgentNotMentionable: role => `${role} can't be mentioned, so urgent pings won't notify anyone. Turn on "Allow anyone to @mention this role", or give Tipoff Mention All Roles.`
    },
    channelNames: { report: "report channel", user: "member reports channel", escalation: "escalation channel" },
    perms: {
      ViewChannel: "View Channel", SendMessages: "Send Messages", SendMessagesInThreads: "Send Messages in Threads",
      EmbedLinks: "Embed Links", AttachFiles: "Attach Files", ReadMessageHistory: "Read Message History",
      ManageChannels: "Manage Channels", ManageMessages: "Manage Messages", ModerateMembers: "Timeout Members",
      KickMembers: "Kick Members", BanMembers: "Ban Members", ManageThreads: "Manage Threads"
    },
    tagNames: { open: "Open", claimed: "Claimed", resolved: "Resolved", dismissed: "Dismissed", urgent: "Urgent" }
  },

  caseView: {
    title: (number, kind, reason, status) => `### Case #${number} · ${kind} · ${reason} · ${status}`,
    card: link => `[Open the card](${link})`,
    noCard: "-# The card hasn't been posted.",
    events: "Timeline",
    reporters: "Reporters",
    notes: "Moderator notes"
  },

  reportsView: {
    userTitle: who => `### Cases about ${who}`,
    none: "No cases about them.",
    line: (number, reason, status, when) => `#${number} · ${reason} · ${status} · ${when}`,
    statsTitle: days => `### Reports in the last ${plural(days, { one: "# day", other: "# days" })}`,
    stats: s => [
      `**Cases:** ${s.total} (${s.open} open, ${s.claimed} claimed, ${s.resolved} resolved, ${s.dismissed} dismissed)`,
      `**Reports:** ${s.reports} from ${plural(s.reporters, { one: "# member", other: "# members" })}`,
      `**Time to first claim:** ${s.toClaim}`,
      `**Time to close:** ${s.toClose}`
    ].join("\n"),
    byReason: "By reason",
    notEnough: "not enough cases yet",
    blocked: who => `${who} can't send reports here any more.`,
    alreadyBlocked: who => `${who} was already blocked.`,
    unblocked: who => `${who} can send reports here again.`,
    notBlocked: who => `${who} wasn't blocked.`,
    cantBlockStaff: "You can't block a moderator or someone with Manage Server.",
    periods: { 7: "7 days", 30: "30 days", 90: "90 days", 365: "A year" },
    // average times in the stats: under an hour, under two days, and longer
    durations: { minutes: n => `${n} min`, hours: n => `${n} h`, days: n => `${n} days` }
  },

  privacy: {
    title: "### What Tipoff keeps about you here",
    asReporter: n => `**Reports you sent:** ${n}`,
    asTarget: n => `**Cases about you:** ${n}`,
    asModerator: n => `**Cases you handled:** ${n}`,
    blocked: "**You're blocked from reporting here.**",
    rules: retention => `Closed cases are deleted after ${plural(retention, { one: "# day", other: "# days" })}; open ones when they close (at most a year). Everything goes 30 days after Tipoff leaves the server. Anonymous reports are never shown to moderators.`,
    cards: "The cards Tipoff posted are in this server's own channels, so the server's admins decide what happens to them.",
    request: link => (link ? `To get a copy, or have something corrected or deleted, see [Tipoff's privacy policy](${link}).` : "To get a copy, or have something corrected or deleted, contact Tipoff's support.")
  },

  alerts: {
    failing: (what, problem) => `### Tipoff can't post reports\n${what}: ${problem}\nReports are saved and will be posted once this is fixed: run \`/setup check\` after fixing it.`,
    problems: { gone: "it can't be found (it may have been deleted)", noAccess: "Tipoff doesn't have permission to post there" },
    ownerDm: server => `-# You're getting this as the owner of **${server}**, because Tipoff couldn't post there.`
  },

  errors: {
    serverOnly: "Tipoff only works inside a server.",
    notAllowed: "You can't use this.",
    needManageServer: "This needs the **Manage Server** permission.",
    needModerator: "This is only for this server's moderators.",
    staffOnly: "This is only for Tipoff's staff.",
    unknownCommand: "That command isn't available any more.",
    expired: "This has expired. Run the command again to start over.",
    failed: "That didn't work, and nothing was changed. Please try again in a moment.",
    title: "Couldn't do that"
  }
};
