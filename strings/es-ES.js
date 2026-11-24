/**
 * Español (España). Our own translation, not yet checked by a native speaker (status "ours"). Keys and shape follow
 * en.js; anything left out falls back to English. Discord's own Spanish (Spain) words are used for its UI (Ajustes del
 * servidor, Aplicaciones, Gestionar servidor, Aislar temporalmente...), and Discord's informal "tú".
 * Latin American Spanish is its own file (es-419.js), not this one.
 *
 * Glossary (use these everywhere in this file):
 *   case            caso                    report (noun)   denuncia       to report      denunciar
 *   reporter        quien denuncia / denunciantes          moderator      moderador / moderadores
 *   claim           asignarse (Asignado)    resolve         resolver (Resuelto)            dismiss   descartar (Descartado)
 *   reopen          reabrir                 escalation      escalado       urgent         urgente
 *   member          miembro                 staff           equipo         timeout        aislamiento temporal
 *   cool-down       tiempo de espera        case card       tarjeta del caso               forum post   publicación del foro
 */

const plural = require("./plural")("es-ES");

module.exports = {
  language: {
    name: "Español (España)",
    locales: ["es-ES"],
    status: "ours",
    unreviewed: link => `-# Esta traducción aún no la ha revisado un hablante nativo. [Ayúdanos a mejorarla](${link}).`
  },

  tagline: "Denuncias con las que tus moderadores pueden actuar.",

  defaultReasons: ["Spam o estafa", "Acoso u odio", "NSFW o contenido explícito", "Suplantación de identidad", "Incumplir las normas"],
  otherReason: "Otro",

  commands: {
    help: { description: "Cómo denunciar algo y cómo configurar Tipoff." },
    reportMessage: { name: "Denunciar mensaje" },
    reportUser: { name: "Denunciar miembro" },
    report: { description: "Denuncia algo a los moderadores de este servidor." },
    setup: {
      description: "Configura Tipoff en este servidor.",
      channels: "Dónde van las denuncias, el rol de urgencias y las denuncias anónimas.",
      roles: "Quién cuenta como moderador y qué denuncias van al canal de escalado.",
      reasons: "Los motivos que se pueden elegir al denunciar.",
      limits: "Tiempos de espera, límites, avisar del resultado y cuánto se guardan los casos.",
      language: "El idioma en que Tipoff publica aquí: tarjetas de casos, etiquetas y avisos.",
      check: "Muestra los ajustes y comprueba que Tipoff puede publicar donde lo necesita."
    },
    case: {
      description: "Ver o cambiar un caso.",
      view: "Muestra un caso.", note: "Añade una nota privada a un caso.", reopen: "Reabre un caso cerrado.",
      number: "El número del caso", text: "Tu nota"
    },
    reports: {
      description: "Denuncias en este servidor.",
      user: "Todos los casos sobre un miembro.", stats: "Cómo van las denuncias en este servidor.",
      block: "Impide que alguien envíe denuncias aquí.", unblock: "Deja que alguien vuelva a enviar denuncias aquí.",
      member: "El miembro", reason: "Por qué (solo lo ven los moderadores)", period: "Hasta cuándo"
    },
    privacy: { description: "Qué guarda Tipoff sobre ti en este servidor y cómo pedir que se borre." }
  },

  help: {
    reportHeading: "Denunciar algo",
    reportMessage: "» **Un mensaje**: haz clic derecho en él › **Aplicaciones** › **Denunciar mensaje**",
    reportUser: "» **Un miembro**: haz clic derecho en él › **Aplicaciones** › **Denunciar miembro**",
    reportOther: "» **Cualquier otra cosa**: `/report`",
    adminHeading: "Para administradores",
    adminSetup: "» `/setup channels` elige dónde van las denuncias; `/setup check` comprueba que todo funciona.",
    discordSafety: url => `-# ¿Algo incumple las normas de Discord? Denúncialo también a Discord: [cómo denunciar a Discord](${url}).`,
    buttons: { guide: "Guía", privacy: "Privacidad", support: "Servidor de soporte", website: "Sitio web" }
  },

  report: {
    titles: { message: "Denunciar mensaje", user: "Denunciar miembro", general: "Denunciar algo" },
    reason: "Motivo",
    reasonHint: "Elige el que más se acerque",
    note: "¿Algo más que deban saber los moderadores?",
    noteHint: "Opcional",
    noteFor: { message: "¿Por qué denuncias este mensaje?", user: "¿Qué ha hecho?" },
    whatHappened: "¿Qué ha pasado?",
    whatHappenedHint: "Explícalo lo más claro que puedas",
    details: "¿Qué denuncias?",
    detailsHint: "Lo más claro que puedas: quién, dónde, cuándo",
    screenshots: "Capturas de pantalla",
    screenshotsHint: "Hasta 5 imágenes (opcional)",
    options: "Opciones",
    urgent: "Avisar a los moderadores",
    urgentHint: "Para algo que necesita atención ya. Úsalo con cabeza, por favor.",
    anonymous: "Denunciar de forma anónima",
    anonymousHint: "Los moderadores no verán tu nombre. Tipoff solo lo guarda para evitar abusos.",
    discordSafety: url => `-# ¿Algo incumple las normas de Discord? Denúncialo también a Discord: [cómo denunciar a Discord](${url}).`,
    previewMessage: (author, when) => `### Denunciar un mensaje\nDe ${author} · ${when}`,
    previewNoText: "-# (sin texto)",
    previewAttachments: n => `-# ${plural(n, { one: "# archivo adjunto", other: "# archivos adjuntos" })}`,
    previewUser: (user, created, joined) => `### Denunciar a ${user}\n-# Cuenta creada ${created}${joined ? ` · se unió ${joined}` : ""}`,
    sent: (number, outcomeDms) => `### Denuncia #${number} enviada\nLos moderadores la revisarán.${outcomeDms ? "\nTe llegará un MD cuando la hayan tramitado." : ""}`,
    sentAnonymous: "-# Has denunciado de forma anónima: los moderadores no verán tu nombre.",
    urgentCoolingDown: "-# Se avisó a los moderadores hace unos minutos, así que no se les ha vuelto a avisar. Tu denuncia está marcada como urgente.",
    notDelivered: "-# Tu denuncia está guardada, pero Tipoff aún no ha podido publicarla. Se ha avisado a los administradores del servidor.",
    refused: {
      self: "No puedes denunciarte a ti mismo.",
      ownMessage: "No puedes denunciar tu propio mensaje.",
      bot: "Ese es el propio Tipoff.",
      notSetUp: "Las denuncias aún no están configuradas en este servidor. Pide a un administrador que use `/setup channels`.",
      blocked: "No puedes enviar denuncias en este servidor.",
      cooldown: minutes => `Acabas de enviar una denuncia. Podrás enviar otra dentro de ${plural(minutes, { one: "# minuto", other: "# minutos" })}.`,
      tooManyOpen: n => `Ya tienes ${plural(n, { one: "# denuncia abierta", other: "# denuncias abiertas" })} aquí. Espera a que los moderadores las tramiten.`,
      gone: "Ya no se ha podido cargar. Puede que se haya eliminado.",
      expired: "Este formulario estuvo abierto demasiado tiempo. Vuelve a empezar la denuncia.",
      empty: "Explica qué estás denunciando."
    }
  },

  card: {
    kinds: { message: "Mensaje denunciado", user: "Miembro denunciado", general: "Denuncia" },
    status: { open: "Abierto", claimed: "Asignado", resolved: "Resuelto", dismissed: "Descartado" },
    reports: n => plural(n, { one: "# denuncia", other: "# denuncias" }),
    urgent: role => `${role} · denuncia urgente`,
    urgentNoRole: "Denuncia urgente",
    escalated: "Escalado: es sobre un miembro del equipo",
    escalatedFallback: "-# No hay canal de escalado, así que esta denuncia sobre el equipo está aquí. `/setup channels` puede añadir uno.",
    noText: "-# (sin texto)",
    by: (who, when, where) => `De ${who} · ${when}${where ? ` · en ${where}` : ""}`,
    forwarded: "reenviado",
    edited: "editado",
    webhook: name => `**${name}** (webhook)`,
    app: user => `${user} (mediante un comando de aplicación)`,
    bot: user => `${user} (bot)`,
    reply: who => `En respuesta a ${who}`,
    embeds: "Insertados",
    stickers: names => `Stickers: ${names}`,
    poll: question => `Encuesta: ${question}`,
    tooBig: links => `-# Demasiado grande para copiarlo: ${links}`,
    linksNote: "-# Los enlaces se muestran como texto para que nadie los abra sin querer.",
    memberDates: (created, joined) => `Cuenta creada ${created}${joined ? ` · se unió ${joined}` : ""}`,
    roles: list => `Roles: ${list}`,
    timedOut: until => `Aislado temporalmente hasta ${until}`,
    leftServer: "Ya no está en el servidor",
    history: (total, resolved, dismissed) => total
      ? `Historial: ${plural(total, { one: "# caso anterior", other: "# casos anteriores" })} sobre este miembro (${plural(resolved, { one: "# resuelto", other: "# resueltos" })}, ${plural(dismissed, { one: "# descartado", other: "# descartados" })})`
      : "Historial: ningún caso anterior sobre este miembro",
    earlier: (number, status) => `Anterior: #${number}, ${status.toLowerCase()}`,
    reportersHeading: "Denunciantes",
    anonymous: "Anónimo",
    noNote: "(sin nota)",
    moreReporters: (n, number) => `… y ${n} más (\`/case view number:${number}\`)`,
    claimedBy: (who, when) => `Asignado a ${who} · ${when}`,
    closedBy: (status, who, when) => `${status} por ${who} · ${when}`,
    note: text => `> ${text}`,
    reposted: "-# La primera tarjeta se eliminó, así que esta se ha publicado desde la copia guardada.",
    buttons: { claim: "Asignármelo", unclaim: "Desasignar", resolve: "Resolver", dismiss: "Descartar", reopen: "Reabrir", jump: "Ir al mensaje", actions: "Acciones…" },
    actions: {
      delete: "Eliminar el mensaje", timeout: "Aislar temporalmente", kick: "Expulsar", ban: "Banear",
      deleteHint: "La copia guardada se queda en el caso", timeoutHint: "De 10 minutos a 1 semana", kickHint: "Puede volver a unirse con una invitación", banHint: "No puede volver a unirse",
      missing: perm => `Tipoff necesita ${perm} para esto`
    },
    threadName: (number, who, reason) => `#${number} · ${who} · ${reason}`,
    threadFallback: { user: "miembro", message: "mensaje" }
  },

  caseActions: {
    resolveTitle: number => `Resolver el caso #${number}`,
    dismissTitle: number => `Descartar el caso #${number}`,
    closeNote: "Nota (opcional)",
    closeNoteHint: "Qué se ha hecho. Los denunciantes nunca la ven.",
    timeoutTitle: number => `Aislar temporalmente (caso #${number})`,
    kickTitle: number => `Expulsar (caso #${number})`,
    banTitle: number => `Banear (caso #${number})`,
    deleteTitle: number => `Eliminar el mensaje (caso #${number})`,
    duration: "Cuánto tiempo",
    durations: { "600": "10 minutos", "3600": "1 hora", "86400": "1 día", "604800": "1 semana" },
    reason: "Motivo",
    reasonHint: "Se muestra en el caso y en el registro de auditoría de Discord",
    confirm: "Confirmar",
    confirmKick: "Sí, expulsar",
    confirmBan: "Sí, banear",
    confirmDelete: "Sí, eliminar el mensaje",
    deleteMessages: "Eliminar también sus mensajes del último día",
    auditReason: (number, by, reason) => `Caso de Tipoff #${number}, por ${by}${reason ? `: ${reason}` : ""}`,
    done: {
      claimed: number => `Te has asignado el caso #${number}.`,
      unclaimed: number => `El caso #${number} ya no está asignado.`,
      resolved: number => `El caso #${number} está resuelto.`,
      dismissed: number => `El caso #${number} está descartado.`,
      reopened: number => `El caso #${number} vuelve a estar abierto.`,
      deleted: "El mensaje se ha eliminado. La copia guardada se queda en el caso.",
      timedOut: (who, duration) => `${who} está aislado temporalmente durante ${duration}.`,
      kicked: who => `${who} ha sido expulsado.`,
      banned: who => `${who} ha sido baneado.`,
      noted: number => `Nota añadida al caso #${number}.`
    },
    refused: {
      notFound: "Ese caso no existe en este servidor.",
      alreadyClosed: "Ese caso ya está cerrado.",
      notClosed: "Ese caso sigue abierto.",
      youNeed: perm => `Necesitas **${perm}** para hacer eso.`,
      tipoffNeeds: perm => `Tipoff necesita **${perm}** para hacer eso.`,
      higherRole: "No puedes hacer eso a alguien cuyo rol más alto es igual o superior al tuyo.",
      tipoffLower: "El rol de Tipoff tiene que estar por encima del suyo. Sube el rol de Tipoff en Ajustes del servidor › Roles.",
      owner: "No puedes hacer eso al propietario del servidor.",
      notAMember: "Ya no está en el servidor.",
      messageGone: "Ese mensaje ya se ha eliminado.",
      escalated: "Este caso es sobre un miembro del equipo. Solo alguien por encima de esa persona puede actuar.",
      notConfirmed: "No se ha hecho nada: no marcaste la casilla de confirmación."
    },
    events: {
      opened: "abierto", joined: "denuncia añadida", claimed: "asignado", unclaimed: "desasignado", resolved: "resuelto", dismissed: "descartado",
      reopened: "reabierto", note: "nota", deleted: "mensaje eliminado", timeout: "aislado temporalmente", kick: "expulsado", ban: "baneado",
      reposted: "tarjeta publicada de nuevo", delivered: "entregado"
    }
  },

  receipts: {
    resolved: (number, server) => `Tu denuncia **#${number}** en **${server}** se ha revisado y los moderadores han tomado medidas. Gracias por denunciarlo.`,
    dismissed: (number, server) => `Tu denuncia **#${number}** en **${server}** se ha revisado. Los moderadores han decidido que esta vez no hace falta hacer nada. Gracias por denunciarlo.`,
    footer: "-# Recibes esto porque este servidor avisa del resultado a quien denuncia. Tipoff nunca dice qué se hizo ni a quién."
  },

  setup: {
    channelsTitle: "Tipoff: dónde van las denuncias",
    reportChannel: "Canal de denuncias",
    reportChannelHint: "Dónde van las denuncias: un canal de texto, un hilo o un foro",
    userChannel: "Canal de denuncias de miembros",
    userChannelHint: "Opcional: las denuncias de miembros van aquí",
    escalationChannel: "Canal de escalado",
    escalationChannelHint: "Opcional: las denuncias sobre el equipo van aquí, fuera de su vista",
    urgentRole: "Rol de urgencias",
    urgentRoleHint: "Opcional: el rol al que se puede avisar en denuncias urgentes",
    options: "Opciones",
    anonymous: "Permitir denuncias anónimas",
    anonymousHint: "Los moderadores no verán quién las envía; Tipoff sigue aplicando los límites",
    rolesTitle: "Tipoff: moderadores y equipo",
    moderatorRoles: "Roles de moderador",
    moderatorRolesHint: "Pueden ver, asignarse y cerrar casos. Con Gestionar servidor siempre se puede.",
    staffRoles: "Roles del equipo",
    staffRolesHint: "Las denuncias sobre estos miembros van al canal de escalado",
    reasonsTitle: "Tipoff: motivos de denuncia",
    reasons: "Motivos, uno por línea",
    reasonsHint: "Hasta 9. «Otro» siempre se añade al final.",
    limitsTitle: "Tipoff: límites y privacidad",
    reporterCooldown: "Minutos entre denuncias (de 0 a 30)",
    reporterCooldownHint: "Para cada miembro",
    maxOpen: "Denuncias abiertas por miembro (de 1 a 20)",
    urgentCooldown: "Minutos entre avisos urgentes (de 0 a 60)",
    urgentCooldownHint: "Para todo el servidor",
    retention: "Días que se guardan los casos (de 30 a 365)",
    limitOptions: "Opciones",
    outcomeDms: "Avisar del resultado por MD a quien denuncia",
    outcomeDmsHint: "Nunca dice qué se hizo ni a quién",
    closePosts: "Cerrar las publicaciones del foro al cerrar un caso",
    languageTitle: "Tipoff: idioma",
    language: "Idioma de este servidor",
    languageHint: "Para tarjetas de casos, etiquetas del foro y avisos. Cada miembro sigue viendo su idioma.",
    languageAuto: name => `El idioma de Discord del servidor (ahora ${name})`,
    languageUnreviewed: "Aún sin revisar por un hablante nativo",
    saved: "### Guardado\nTus ajustes se han guardado. Así quedan:",
    nothingChanged: "-# No se ha cambiado nada.",
    invalidNumber: (label, min, max) => `**${label}** tiene que ser un número entero de ${min} a ${max}.`,
    tooManyReasons: "Puedes tener hasta 9 motivos («Otro» se añade solo).",
    reasonTooLong: "Cada motivo puede tener hasta 80 caracteres.",
    noReasons: "Añade al menos un motivo o vacía el cuadro para usar los predeterminados.",
    channelGone: channel => `No se encuentra ${channel}. Puede que se haya eliminado.`,
    notNeeded: "-# (sin configurar)",
    summary: s => [
      `**Las denuncias van a:** ${s.report}`,
      `**Las denuncias de miembros van a:** ${s.user}`,
      `**Las denuncias sobre el equipo van a:** ${s.escalation}`,
      `**Rol de urgencias:** ${s.urgentRole}`,
      `**Roles de moderador:** ${s.moderators}`,
      `**Roles del equipo:** ${s.staff}`,
      `**Denuncias anónimas:** ${s.anonymous ? "permitidas" : "desactivadas"}`,
      `**Motivos:** ${s.reasons}`,
      `**Entre denuncias:** ${plural(s.reporterCooldown, { one: "# minuto", other: "# minutos" })} · **Máximo de denuncias abiertas por miembro:** ${s.maxOpen} · **Entre avisos urgentes:** ${plural(s.urgentCooldown, { one: "# minuto", other: "# minutos" })}`,
      `**Idioma:** ${s.language}`,
      `**Avisar del resultado:** ${s.outcomeDms ? "sí" : "no"} · **Cerrar publicaciones del foro al terminar:** ${s.closePosts ? "sí" : "no"} · **Guardar casos cerrados:** ${plural(s.retention, { one: "# día", other: "# días" })}`
    ].join("\n"),
    checkTitle: "### Comprobación de Tipoff",
    checkOk: "Todo listo. Los miembros pueden denunciar con clic derecho › **Aplicaciones**, o con `/report`.",
    checkProblems: "Arregla esto para que las denuncias lleguen a tus moderadores:",
    redelivered: n => `-# ${plural(n, { one: "# denuncia pendiente publicada", other: "# denuncias pendientes publicadas" })} ahora.`,
    stillWaiting: n => `-# ${plural(n, { one: "# denuncia sigue", other: "# denuncias siguen" })} pendiente de publicar.`,
    problems: {
      noChannel: "Aún no hay canal de denuncias: usa `/setup channels`.",
      missingChannel: (what, id) => `No se encuentra el ${what} (<#${id}>). Elige otro con \`/setup channels\`.`,
      missingPerms: (channel, perms) => `En ${channel}, Tipoff necesita: ${perms}.`,
      noTags: (channel, tags) => `${channel} es un foro y Tipoff no puede crear sus etiquetas de estado (necesita Gestionar canales ahí). Dale ese permiso o añade tú estas etiquetas: ${tags}.`,
      urgentRoleGone: "El rol de urgencias se ha eliminado; nadie recibirá los avisos. Elige otro con `/setup channels` o déjalo vacío.",
      urgentNotMentionable: role => `No se puede mencionar a ${role}, así que los avisos urgentes no notificarán a nadie. Activa «Permitir que cualquiera @mencione este rol» o da a Tipoff Mencionar @everyone, @here y todos los roles.`
    },
    channelNames: { report: "canal de denuncias", user: "canal de denuncias de miembros", escalation: "canal de escalado" },
    perms: {
      ViewChannel: "Ver canal", SendMessages: "Enviar mensajes", SendMessagesInThreads: "Enviar mensajes en hilos",
      EmbedLinks: "Insertar enlaces", AttachFiles: "Adjuntar archivos", ReadMessageHistory: "Leer el historial de mensajes",
      ManageChannels: "Gestionar canales", ManageMessages: "Gestionar mensajes", ModerateMembers: "Aislar temporalmente a miembros",
      KickMembers: "Expulsar miembros", BanMembers: "Banear miembros", ManageThreads: "Gestionar hilos"
    },
    tagNames: { open: "Abierto", claimed: "Asignado", resolved: "Resuelto", dismissed: "Descartado", urgent: "Urgente" }
  },

  caseView: {
    title: (number, kind, reason, status) => `### Caso #${number} · ${kind} · ${reason} · ${status}`,
    card: link => `[Abrir la tarjeta](${link})`,
    noCard: "-# La tarjeta no se ha publicado.",
    events: "Cronología",
    reporters: "Denunciantes",
    notes: "Notas de los moderadores"
  },

  reportsView: {
    userTitle: who => `### Casos sobre ${who}`,
    none: "No hay casos sobre este miembro.",
    line: (number, reason, status, when) => `#${number} · ${reason} · ${status} · ${when}`,
    statsTitle: days => `### Denuncias ${plural(days, { one: "del último día", other: "de los últimos # días" })}`,
    stats: s => [
      `**Casos:** ${s.total} (${plural(s.open, { one: "# abierto", other: "# abiertos" })}, ${plural(s.claimed, { one: "# asignado", other: "# asignados" })}, ${plural(s.resolved, { one: "# resuelto", other: "# resueltos" })}, ${plural(s.dismissed, { one: "# descartado", other: "# descartados" })})`,
      `**Denuncias:** ${s.reports} de ${plural(s.reporters, { one: "# miembro", other: "# miembros" })}`,
      `**Tiempo hasta la primera asignación:** ${s.toClaim}`,
      `**Tiempo hasta el cierre:** ${s.toClose}`
    ].join("\n"),
    byReason: "Por motivo",
    notEnough: "aún no hay suficientes casos",
    blocked: who => `${who} ya no puede enviar denuncias aquí.`,
    alreadyBlocked: who => `${who} ya estaba bloqueado.`,
    unblocked: who => `${who} puede volver a enviar denuncias aquí.`,
    notBlocked: who => `${who} no estaba bloqueado.`,
    cantBlockStaff: "No puedes bloquear a un moderador ni a nadie con Gestionar servidor.",
    periods: { 7: "7 días", 30: "30 días", 90: "90 días", 365: "Un año" },
    durations: { minutes: n => `${n} min`, hours: n => `${n} h`, days: n => `${n} días` }
  },

  privacy: {
    title: "### Qué guarda Tipoff sobre ti aquí",
    asReporter: n => `**Denuncias que has enviado:** ${n}`,
    asTarget: n => `**Casos sobre ti:** ${n}`,
    asModerator: n => `**Casos que has gestionado:** ${n}`,
    blocked: "**Tienes bloqueado denunciar aquí.**",
    rules: retention => `Los casos cerrados se eliminan a los ${plural(retention, { one: "# día", other: "# días" })}; los abiertos, cuando se cierran (como mucho, un año). Todo se borra 30 días después de que Tipoff salga del servidor. Las denuncias anónimas nunca se muestran a los moderadores.`,
    cards: "Las tarjetas que publicó Tipoff están en los canales de este servidor, así que sus administradores deciden qué pasa con ellas.",
    request: link => (link ? `Para obtener una copia, o pedir que se corrija o elimine algo, consulta [la política de privacidad de Tipoff](${link}).` : "Para obtener una copia, o pedir que se corrija o elimine algo, contacta con el soporte de Tipoff.")
  },

  alerts: {
    failing: (what, problem) => `### Tipoff no puede publicar denuncias\n${what}: ${problem}\nLas denuncias se guardan y se publicarán cuando se arregle: usa \`/setup check\` después de arreglarlo.`,
    problems: { gone: "no se encuentra (puede que se haya eliminado)", noAccess: "Tipoff no tiene permiso para publicar ahí" },
    ownerDm: server => `-# Recibes esto como propietario de **${server}**, porque Tipoff no ha podido publicar ahí.`
  },

  errors: {
    serverOnly: "Tipoff solo funciona dentro de un servidor.",
    notAllowed: "No puedes usar esto.",
    needManageServer: "Esto necesita el permiso **Gestionar servidor**.",
    needModerator: "Esto es solo para los moderadores de este servidor.",
    staffOnly: "Esto es solo para el equipo de Tipoff.",
    unknownCommand: "Ese comando ya no está disponible.",
    expired: "Esto ha caducado. Vuelve a usar el comando para empezar de nuevo.",
    failed: "No ha funcionado y no se ha cambiado nada. Inténtalo de nuevo en un momento.",
    title: "No se ha podido hacer"
  }
};
