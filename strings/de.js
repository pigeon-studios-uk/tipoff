/**
 * Deutsch. Our own translation, not yet checked by a native speaker (status "ours"). Keys and shape follow en.js;
 * anything left out falls back to English. Discord's own German words are used for its UI (Servereinstellungen, Apps,
 * Server verwalten...), and Discord's informal "du".
 *
 * Glossary (use these everywhere in this file):
 *   case            Fall                    report (noun)   Meldung        to report      melden
 *   reporter        Meldende(r) / wer gemeldet hat         moderator      Moderator / Moderatoren
 *   claim           übernehmen              resolve         erledigen      dismiss        abweisen
 *   reopen          wieder öffnen           escalation      Eskalation     urgent         dringend
 *   member          Mitglied                staff           Teammitglieder / Team
 *   cool-down       Wartezeit               case card       Fallkarte      forum post     Forumbeitrag
 */

const plural = require("./plural")("de");

module.exports = {
  language: {
    name: "Deutsch",
    locales: ["de"],
    status: "ours",
    unreviewed: link => `-# Diese Übersetzung wurde noch nicht von Muttersprachlern geprüft. [Hilf mit, sie zu verbessern](${link}).`
  },

  tagline: "Meldungen, mit denen deine Moderatoren arbeiten können.",

  defaultReasons: ["Spam oder Betrug", "Belästigung oder Hass", "NSFW oder verstörend", "Identitätsbetrug", "Regelverstoß"],
  otherReason: "Sonstiges",

  commands: {
    help: { description: "Wie du etwas meldest und wie du Tipoff einrichtest." },
    reportMessage: { name: "Nachricht melden" },
    reportUser: { name: "Mitglied melden" },
    report: { description: "Melde den Moderatoren dieses Servers etwas." },
    setup: {
      description: "Richte Tipoff für diesen Server ein.",
      channels: "Wohin Meldungen gehen, die Rolle für dringende Meldungen und anonyme Meldungen.",
      roles: "Wer als Moderator zählt und wessen Meldungen in den Eskalationskanal gehen.",
      reasons: "Die Gründe, aus denen man beim Melden wählt.",
      limits: "Wartezeiten, Limits, Ergebnis an Meldende und wie lange Fälle bleiben.",
      language: "Die Sprache, in der Tipoff hier postet: Fallkarten, Forum-Tags und Hinweise.",
      check: "Zeigt die Einstellungen und prüft, ob Tipoff überall posten kann."
    },
    case: {
      description: "Einen Fall ansehen oder ändern.",
      view: "Einen Fall anzeigen.", note: "Eine private Notiz zu einem Fall hinzufügen.", reopen: "Einen geschlossenen Fall wieder öffnen.",
      number: "Die Fallnummer", text: "Deine Notiz"
    },
    reports: {
      description: "Meldungen auf diesem Server.",
      user: "Alle Fälle über ein Mitglied.", stats: "Wie es mit den Meldungen auf diesem Server läuft.",
      block: "Jemanden hier vom Melden ausschließen.", unblock: "Jemanden hier wieder melden lassen.",
      member: "Das Mitglied", reason: "Warum (nur Moderatoren sehen das)", period: "Zeitraum"
    },
    privacy: { description: "Was Tipoff auf diesem Server über dich speichert und wie du es löschen lässt." }
  },

  help: {
    reportHeading: "Etwas melden",
    reportMessage: "» **Eine Nachricht**: Rechtsklick darauf › **Apps** › **Nachricht melden**",
    reportUser: "» **Ein Mitglied**: Rechtsklick darauf › **Apps** › **Mitglied melden**",
    reportOther: "» **Alles andere**: `/report`",
    adminHeading: "Für Admins",
    adminSetup: "» `/setup channels` legt fest, wohin Meldungen gehen; `/setup check` prüft, ob alles funktioniert.",
    discordSafety: url => `-# Verstößt etwas gegen Discords eigene Regeln? Melde es auch Discord: [so meldest du etwas an Discord](${url}).`,
    buttons: { guide: "Anleitung", privacy: "Datenschutz", support: "Support-Server", website: "Website" }
  },

  report: {
    titles: { message: "Nachricht melden", user: "Mitglied melden", general: "Etwas melden" },
    reason: "Grund",
    reasonHint: "Wähle den passendsten",
    note: "Sollten die Moderatoren noch etwas wissen?",
    noteHint: "Optional",
    noteFor: { message: "Warum meldest du diese Nachricht?", user: "Was hat das Mitglied getan?" },
    whatHappened: "Was ist passiert?",
    whatHappenedHint: "So genau wie möglich",
    details: "Was meldest du?",
    detailsHint: "So genau wie möglich: wer, wo, wann",
    screenshots: "Screenshots",
    screenshotsHint: "Bis zu 5 Bilder (optional)",
    options: "Optionen",
    urgent: "Moderatoren pingen",
    urgentHint: "Für etwas, das sofort Aufmerksamkeit braucht. Bitte mit Bedacht nutzen.",
    anonymous: "Anonym melden",
    anonymousHint: "Moderatoren sehen deinen Namen nicht. Tipoff speichert ihn nur gegen Missbrauch.",
    discordSafety: url => `-# Verstößt etwas gegen Discords eigene Regeln? Melde es auch Discord: [so meldest du etwas an Discord](${url}).`,
    previewMessage: (author, when) => `### Nachricht melden\nVon ${author} · ${when}`,
    previewNoText: "-# (kein Text)",
    previewAttachments: n => `-# ${plural(n, { one: "# Anhang", other: "# Anhänge" })}`,
    previewUser: (user, created, joined) => `### ${user} melden\n-# Account erstellt ${created}${joined ? ` · beigetreten ${joined}` : ""}`,
    sent: (number, outcomeDms) => `### Meldung #${number} gesendet\nDie Moderatoren sehen sie sich an.${outcomeDms ? "\nDu bekommst eine DM, sobald sie bearbeitet wurde." : ""}`,
    sentAnonymous: "-# Du hast anonym gemeldet: Die Moderatoren sehen deinen Namen nicht.",
    urgentCoolingDown: "-# Die Moderatoren wurden vor ein paar Minuten gepingt und daher nicht erneut. Deine Meldung ist als dringend markiert.",
    notDelivered: "-# Deine Meldung ist gespeichert, aber Tipoff konnte sie noch nicht posten. Die Admins des Servers wurden informiert.",
    refused: {
      self: "Du kannst dich nicht selbst melden.",
      ownMessage: "Du kannst deine eigene Nachricht nicht melden.",
      bot: "Das ist Tipoff selbst.",
      notSetUp: "Meldungen sind auf diesem Server noch nicht eingerichtet. Bitte einen Admin, `/setup channels` auszuführen.",
      blocked: "Du kannst auf diesem Server keine Meldungen senden.",
      cooldown: minutes => `Du hast gerade eine Meldung gesendet. Die nächste kannst du in ${plural(minutes, { one: "# Minute", other: "# Minuten" })} senden.`,
      tooManyOpen: n => `Du hast hier schon ${plural(n, { one: "# offene Meldung", other: "# offene Meldungen" })}. Bitte warte, bis die Moderatoren sie bearbeitet haben.`,
      gone: "Das konnte nicht mehr geladen werden. Vielleicht wurde es gelöscht.",
      expired: "Dieses Formular war zu lange offen. Bitte starte die Meldung neu.",
      empty: "Bitte beschreibe, was du meldest."
    }
  },

  card: {
    kinds: { message: "Nachricht gemeldet", user: "Mitglied gemeldet", general: "Meldung" },
    status: { open: "Offen", claimed: "Übernommen", resolved: "Erledigt", dismissed: "Abgewiesen" },
    reports: n => plural(n, { one: "# Meldung", other: "# Meldungen" }),
    urgent: role => `${role} · dringende Meldung`,
    urgentNoRole: "Dringende Meldung",
    escalated: "Eskaliert: Es geht um ein Teammitglied",
    escalatedFallback: "-# Es ist kein Eskalationskanal festgelegt, deshalb steht diese Meldung über ein Teammitglied hier. Mit `/setup channels` kannst du einen festlegen.",
    noText: "-# (kein Text)",
    by: (who, when, where) => `Von ${who} · ${when}${where ? ` · in ${where}` : ""}`,
    forwarded: "weitergeleitet",
    edited: "bearbeitet",
    webhook: name => `**${name}** (Webhook)`,
    app: user => `${user} (über einen App-Befehl)`,
    bot: user => `${user} (Bot)`,
    reply: who => `Antwort auf ${who}`,
    embeds: "Embeds",
    stickers: names => `Sticker: ${names}`,
    poll: question => `Umfrage: ${question}`,
    tooBig: links => `-# Zu groß zum Kopieren: ${links}`,
    linksNote: "-# Links werden als Text angezeigt, damit niemand sie versehentlich anklickt.",
    memberDates: (created, joined) => `Account erstellt ${created}${joined ? ` · beigetreten ${joined}` : ""}`,
    roles: list => `Rollen: ${list}`,
    timedOut: until => `Im Timeout bis ${until}`,
    leftServer: "Nicht mehr auf dem Server",
    history: (total, resolved, dismissed) => total
      ? `Verlauf: ${plural(total, { one: "# früherer Fall", other: "# frühere Fälle" })} über das Mitglied (${resolved} erledigt, ${dismissed} abgewiesen)`
      : "Verlauf: keine früheren Fälle über das Mitglied",
    earlier: (number, status) => `Früher: #${number}, ${status.toLowerCase()}`,
    reportersHeading: "Meldende",
    anonymous: "Anonym",
    noNote: "(keine Notiz)",
    moreReporters: (n, number) => `… und ${n} weitere (\`/case view number:${number}\`)`,
    claimedBy: (who, when) => `Übernommen von ${who} · ${when}`,
    closedBy: (status, who, when) => `${status} von ${who} · ${when}`,
    note: text => `> ${text}`,
    reposted: "-# Die erste Karte wurde gelöscht, deshalb wurde diese aus der gespeicherten Kopie gepostet.",
    buttons: { claim: "Übernehmen", unclaim: "Abgeben", resolve: "Erledigen", dismiss: "Abweisen", reopen: "Wieder öffnen", jump: "Zur Nachricht", actions: "Aktionen …" },
    actions: {
      delete: "Nachricht löschen", timeout: "Timeout", kick: "Kicken", ban: "Bannen",
      deleteHint: "Die gespeicherte Kopie bleibt im Fall", timeoutHint: "10 Minuten bis 1 Woche", kickHint: "Mit einer Einladung kann das Mitglied wieder beitreten", banHint: "Das Mitglied kann nicht wieder beitreten",
      missing: perm => `Tipoff braucht dafür ${perm}`
    },
    threadName: (number, who, reason) => `#${number} · ${who} · ${reason}`,
    threadFallback: { user: "mitglied", message: "nachricht" }
  },

  caseActions: {
    resolveTitle: number => `Fall #${number} erledigen`,
    dismissTitle: number => `Fall #${number} abweisen`,
    closeNote: "Notiz (optional)",
    closeNoteHint: "Was getan wurde. Meldende sehen das nie.",
    timeoutTitle: number => `Timeout (Fall #${number})`,
    kickTitle: number => `Kicken (Fall #${number})`,
    banTitle: number => `Bannen (Fall #${number})`,
    deleteTitle: number => `Nachricht löschen (Fall #${number})`,
    duration: "Wie lange",
    durations: { "600": "10 Minuten", "3600": "1 Stunde", "86400": "1 Tag", "604800": "1 Woche" },
    reason: "Grund",
    reasonHint: "Steht im Fall und im Audit-Log von Discord",
    confirm: "Bestätigen",
    confirmKick: "Ja, kicken",
    confirmBan: "Ja, bannen",
    confirmDelete: "Ja, Nachricht löschen",
    deleteMessages: "Auch die Nachrichten des letzten Tages löschen",
    auditReason: (number, by, reason) => `Tipoff-Fall #${number}, von ${by}${reason ? `: ${reason}` : ""}`,
    done: {
      claimed: number => `Du hast Fall #${number} übernommen.`,
      unclaimed: number => `Fall #${number} ist wieder frei.`,
      resolved: number => `Fall #${number} ist erledigt.`,
      dismissed: number => `Fall #${number} ist abgewiesen.`,
      reopened: number => `Fall #${number} ist wieder offen.`,
      deleted: "Die Nachricht ist gelöscht. Die gespeicherte Kopie bleibt im Fall.",
      timedOut: (who, duration) => `${who} ist für ${duration} im Timeout.`,
      kicked: who => `${who} wurde gekickt.`,
      banned: who => `${who} wurde gebannt.`,
      noted: number => `Notiz zu Fall #${number} hinzugefügt.`
    },
    refused: {
      notFound: "Diesen Fall gibt es auf diesem Server nicht.",
      alreadyClosed: "Dieser Fall ist schon geschlossen.",
      notClosed: "Dieser Fall ist noch offen.",
      youNeed: perm => `Dafür brauchst du **${perm}**.`,
      tipoffNeeds: perm => `Dafür braucht Tipoff **${perm}**.`,
      higherRole: "Das geht nicht bei jemandem, dessen höchste Rolle gleich hoch oder höher ist als deine.",
      tipoffLower: "Dafür muss die Rolle von Tipoff höher sein als die des Mitglieds. Schieb die Rolle von Tipoff unter Servereinstellungen › Rollen nach oben.",
      owner: "Das geht nicht beim Serverinhaber.",
      notAMember: "Das Mitglied ist nicht mehr auf dem Server.",
      messageGone: "Diese Nachricht wurde schon gelöscht.",
      escalated: "In diesem Fall geht es um ein Teammitglied. Nur jemand darüber kann ihn bearbeiten.",
      notConfirmed: "Es wurde nichts getan: Du hast das Bestätigungsfeld nicht angehakt."
    },
    events: {
      opened: "eröffnet", joined: "Meldung hinzugefügt", claimed: "übernommen", unclaimed: "abgegeben", resolved: "erledigt", dismissed: "abgewiesen",
      reopened: "wieder geöffnet", note: "Notiz", deleted: "Nachricht gelöscht", timeout: "Timeout", kick: "gekickt", ban: "gebannt",
      reposted: "Karte neu gepostet", delivered: "zugestellt"
    }
  },

  receipts: {
    resolved: (number, server) => `Deine Meldung **#${number}** auf **${server}** wurde geprüft, und die Moderatoren haben gehandelt. Danke, dass du sie gemeldet hast.`,
    dismissed: (number, server) => `Deine Meldung **#${number}** auf **${server}** wurde geprüft. Die Moderatoren haben entschieden, dass diesmal nichts zu tun ist. Danke, dass du sie gemeldet hast.`,
    footer: "-# Du bekommst das, weil dieser Server Meldenden das Ergebnis mitteilt. Tipoff sagt nie, was getan wurde oder gegen wen."
  },

  setup: {
    channelsTitle: "Tipoff: wohin Meldungen gehen",
    reportChannel: "Meldekanal",
    reportChannelHint: "Wohin Meldungen gehen: ein Textkanal, Thread oder Forum",
    userChannel: "Kanal für Mitgliedermeldungen",
    userChannelHint: "Optional: Meldungen über Mitglieder gehen stattdessen hierhin",
    escalationChannel: "Eskalationskanal",
    escalationChannelHint: "Optional: Meldungen über das Team gehen hierhin, außer Sicht des Teams",
    urgentRole: "Rolle für dringende Meldungen",
    urgentRoleHint: "Optional: die Rolle, die Meldende bei dringenden Meldungen pingen können",
    options: "Optionen",
    anonymous: "Anonyme Meldungen erlauben",
    anonymousHint: "Moderatoren sehen nicht, wer sie gesendet hat; die Limits gelten trotzdem",
    rolesTitle: "Tipoff: Moderatoren und Team",
    moderatorRoles: "Moderatorrollen",
    moderatorRolesHint: "Können Fälle sehen, übernehmen und schließen. Mit „Server verwalten“ geht das immer.",
    staffRoles: "Teamrollen",
    staffRolesHint: "Meldungen über diese Mitglieder gehen in den Eskalationskanal",
    reasonsTitle: "Tipoff: Meldegründe",
    reasons: "Gründe, einer pro Zeile",
    reasonsHint: "Bis zu 9. „Sonstiges“ wird immer am Ende ergänzt.",
    limitsTitle: "Tipoff: Limits und Datenschutz",
    reporterCooldown: "Minuten zwischen Meldungen (0 bis 30)",
    reporterCooldownHint: "Für jedes Mitglied",
    maxOpen: "Offene Meldungen pro Mitglied (1 bis 20)",
    urgentCooldown: "Minuten zwischen dringenden Pings (0 bis 60)",
    urgentCooldownHint: "Für den ganzen Server",
    retention: "Tage, die geschlossene Fälle bleiben (30–365)",
    limitOptions: "Optionen",
    outcomeDms: "Meldenden das Ergebnis per DM mitteilen",
    outcomeDmsHint: "Sagt nie, was getan wurde oder gegen wen",
    closePosts: "Forumbeiträge schließen, wenn ein Fall geschlossen wird",
    languageTitle: "Tipoff: Sprache",
    language: "Sprache für diesen Server",
    languageHint: "Für Fallkarten, Forum-Tags und Hinweise. Mitglieder sehen weiter ihre eigene Sprache.",
    languageAuto: name => `Die Discord-Sprache des Servers (jetzt ${name})`,
    languageUnreviewed: "Noch nicht von Muttersprachlern geprüft",
    saved: "### Gespeichert\nDeine Einstellungen sind gespeichert. So sehen sie aus:",
    nothingChanged: "-# Es wurde nichts geändert.",
    invalidNumber: (label, min, max) => `**${label}** muss eine ganze Zahl von ${min} bis ${max} sein.`,
    tooManyReasons: "Du kannst bis zu 9 Gründe haben („Sonstiges“ wird für dich ergänzt).",
    reasonTooLong: "Jeder Grund darf bis zu 80 Zeichen lang sein.",
    noReasons: "Füge mindestens einen Grund hinzu oder leere das Feld, um die Standardgründe zu nutzen.",
    channelGone: channel => `${channel} wurde nicht gefunden. Vielleicht wurde er gelöscht.`,
    notNeeded: "-# (nicht festgelegt)",
    summary: s => [
      `**Meldungen gehen an:** ${s.report}`,
      `**Mitgliedermeldungen gehen an:** ${s.user}`,
      `**Meldungen über das Team gehen an:** ${s.escalation}`,
      `**Rolle für dringende Meldungen:** ${s.urgentRole}`,
      `**Moderatorrollen:** ${s.moderators}`,
      `**Teamrollen:** ${s.staff}`,
      `**Anonyme Meldungen:** ${s.anonymous ? "erlaubt" : "aus"}`,
      `**Gründe:** ${s.reasons}`,
      `**Zwischen Meldungen:** ${plural(s.reporterCooldown, { one: "# Minute", other: "# Minuten" })} · **Höchstens offene Meldungen pro Mitglied:** ${s.maxOpen} · **Zwischen dringenden Pings:** ${plural(s.urgentCooldown, { one: "# Minute", other: "# Minuten" })}`,
      `**Sprache:** ${s.language}`,
      `**Ergebnis an Meldende:** ${s.outcomeDms ? "ja" : "nein"} · **Forumbeiträge schließen, wenn erledigt:** ${s.closePosts ? "ja" : "nein"} · **Geschlossene Fälle behalten:** ${plural(s.retention, { one: "# Tag", other: "# Tage" })}`
    ].join("\n"),
    checkTitle: "### Tipoff-Prüfung",
    checkOk: "Alles bereit. Mitglieder können per Rechtsklick › **Apps** melden oder mit `/report`.",
    checkProblems: "Behebe das, damit Meldungen bei deinen Moderatoren ankommen:",
    redelivered: n => `-# ${plural(n, { one: "# wartende Meldung", other: "# wartende Meldungen" })} jetzt gepostet.`,
    stillWaiting: n => `-# ${plural(n, { one: "# Meldung wartet", other: "# Meldungen warten" })} noch darauf, gepostet zu werden.`,
    problems: {
      noChannel: "Noch kein Meldekanal: Führe `/setup channels` aus.",
      missingChannel: (what, id) => `Der ${what} (<#${id}>) wurde nicht gefunden. Wähle mit \`/setup channels\` einen anderen.`,
      missingPerms: (channel, perms) => `In ${channel} braucht Tipoff: ${perms}.`,
      noTags: (channel, tags) => `${channel} ist ein Forum, und Tipoff kann seine Status-Tags nicht anlegen (dafür braucht es dort „Kanäle verwalten“). Erlaube das, oder lege diese Tags selbst an: ${tags}.`,
      urgentRoleGone: "Die Rolle für dringende Meldungen wurde gelöscht; Meldende können niemanden pingen. Wähle mit `/setup channels` eine andere oder lass das Feld leer.",
      urgentNotMentionable: role => `${role} kann nicht erwähnt werden, daher benachrichtigen dringende Pings niemanden. Aktiviere „Jedem erlauben, diese Rolle zu @erwähnen“ oder gib Tipoff „@everyone, @here und alle Rollen erwähnen“.`
    },
    channelNames: { report: "Meldekanal", user: "Kanal für Mitgliedermeldungen", escalation: "Eskalationskanal" },
    perms: {
      ViewChannel: "Kanal ansehen", SendMessages: "Nachrichten senden", SendMessagesInThreads: "Nachrichten in Threads senden",
      EmbedLinks: "Links einbetten", AttachFiles: "Dateien anhängen", ReadMessageHistory: "Nachrichtenverlauf anzeigen",
      ManageChannels: "Kanäle verwalten", ManageMessages: "Nachrichten verwalten", ModerateMembers: "Mitglieder im Timeout",
      KickMembers: "Mitglieder kicken", BanMembers: "Mitglieder bannen", ManageThreads: "Threads verwalten"
    },
    tagNames: { open: "Offen", claimed: "Übernommen", resolved: "Erledigt", dismissed: "Abgewiesen", urgent: "Dringend" }
  },

  caseView: {
    title: (number, kind, reason, status) => `### Fall #${number} · ${kind} · ${reason} · ${status}`,
    card: link => `[Karte öffnen](${link})`,
    noCard: "-# Die Karte wurde noch nicht gepostet.",
    events: "Verlauf",
    reporters: "Meldende",
    notes: "Notizen der Moderatoren"
  },

  reportsView: {
    userTitle: who => `### Fälle über ${who}`,
    none: "Keine Fälle über das Mitglied.",
    line: (number, reason, status, when) => `#${number} · ${reason} · ${status} · ${when}`,
    statsTitle: days => `### Meldungen der letzten ${plural(days, { one: "# Tag", other: "# Tage" })}`,
    stats: s => [
      `**Fälle:** ${s.total} (${s.open} offen, ${s.claimed} übernommen, ${s.resolved} erledigt, ${s.dismissed} abgewiesen)`,
      `**Meldungen:** ${s.reports} von ${plural(s.reporters, { one: "# Mitglied", other: "# Mitgliedern" })}`,
      `**Zeit bis zur ersten Übernahme:** ${s.toClaim}`,
      `**Zeit bis zum Schließen:** ${s.toClose}`
    ].join("\n"),
    byReason: "Nach Grund",
    notEnough: "noch nicht genug Fälle",
    blocked: who => `${who} kann hier keine Meldungen mehr senden.`,
    alreadyBlocked: who => `${who} war schon ausgeschlossen.`,
    unblocked: who => `${who} kann hier wieder Meldungen senden.`,
    notBlocked: who => `${who} war nicht ausgeschlossen.`,
    cantBlockStaff: "Du kannst keine Moderatoren und niemanden mit „Server verwalten“ ausschließen.",
    periods: { 7: "7 Tage", 30: "30 Tage", 90: "90 Tage", 365: "Ein Jahr" },
    durations: { minutes: n => `${n} Min.`, hours: n => `${n} Std.`, days: n => `${n} Tage` }
  },

  privacy: {
    title: "### Was Tipoff hier über dich speichert",
    asReporter: n => `**Von dir gesendete Meldungen:** ${n}`,
    asTarget: n => `**Fälle über dich:** ${n}`,
    asModerator: n => `**Von dir bearbeitete Fälle:** ${n}`,
    blocked: "**Du bist hier vom Melden ausgeschlossen.**",
    rules: retention => `Geschlossene Fälle werden nach ${plural(retention, { one: "# Tag", other: "# Tagen" })} gelöscht, offene, sobald sie geschlossen werden (höchstens nach einem Jahr). Alles wird 30 Tage, nachdem Tipoff den Server verlassen hat, gelöscht. Anonyme Meldungen werden Moderatoren nie angezeigt.`,
    cards: "Die Karten, die Tipoff gepostet hat, liegen in den Kanälen dieses Servers, daher entscheiden die Admins des Servers, was mit ihnen passiert.",
    request: link => (link ? `Für eine Kopie, eine Berichtigung oder Löschung siehe [die Datenschutzerklärung von Tipoff](${link}).` : "Für eine Kopie, eine Berichtigung oder Löschung wende dich an den Support von Tipoff.")
  },

  alerts: {
    failing: (what, problem) => `### Tipoff kann keine Meldungen posten\n${what}: ${problem}\nMeldungen werden gespeichert und gepostet, sobald das behoben ist: Führe danach \`/setup check\` aus.`,
    problems: { gone: "er wurde nicht gefunden (vielleicht gelöscht)", noAccess: "Tipoff darf dort nicht posten" },
    ownerDm: server => `-# Du bekommst das als Inhaber von **${server}**, weil Tipoff dort nicht posten konnte.`
  },

  errors: {
    serverOnly: "Tipoff funktioniert nur auf einem Server.",
    notAllowed: "Das kannst du nicht nutzen.",
    needManageServer: "Dafür brauchst du die Berechtigung **Server verwalten**.",
    needModerator: "Das ist nur für die Moderatoren dieses Servers.",
    staffOnly: "Das ist nur für das Team von Tipoff.",
    unknownCommand: "Diesen Befehl gibt es nicht mehr.",
    expired: "Das ist abgelaufen. Führe den Befehl erneut aus, um neu zu starten.",
    failed: "Das hat nicht geklappt, und es wurde nichts geändert. Bitte versuch es gleich noch einmal.",
    title: "Das hat nicht geklappt"
  }
};
