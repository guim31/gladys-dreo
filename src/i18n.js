// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. Feature names and option labels are written once, in the
// configured language (Gladys does not tell a device integration the user's
// language); messages shown in Gladys are multi-language objects.
// German says "du", Spanish says "usted" (test/i18n.test.js checks it).
// -----------------------------------------------------------------------------

/** Feature names, by language. */
export const NAMES = {
  en: {
    power: 'Power',
    speed: 'Fan speed',
    mode: 'Mode',
    oscillation: 'Oscillation',
    temperature: 'Temperature',
    pm25: 'PM2.5',
    childLock: 'Child lock',
    targetTemperature: 'Target temperature',
    heatLevel: 'Heat level',
    humidity: 'Humidity',
    targetHumidity: 'Target humidity (%)',
    mistLevel: 'Mist level',
    waterLevel: 'Water level',
    waterTank: 'Water tank',
    filterLife: 'Filter life',
  },
  fr: {
    power: 'Marche/arrêt',
    speed: 'Vitesse',
    mode: 'Mode',
    oscillation: 'Oscillation',
    temperature: 'Température',
    pm25: 'PM2.5',
    childLock: 'Sécurité enfant',
    targetTemperature: 'Consigne',
    heatLevel: 'Puissance de chauffe',
    humidity: 'Humidité',
    targetHumidity: "Consigne d'humidité (%)",
    mistLevel: 'Brumisation',
    waterLevel: "Niveau d'eau",
    waterTank: "Réservoir d'eau",
    filterLife: 'Durée de vie du filtre',
  },
  de: {
    power: 'Ein/Aus',
    speed: 'Lüfterstufe',
    mode: 'Modus',
    oscillation: 'Oszillation',
    temperature: 'Temperatur',
    pm25: 'PM2.5',
    childLock: 'Kindersicherung',
    targetTemperature: 'Solltemperatur',
    heatLevel: 'Heizstufe',
    humidity: 'Luftfeuchtigkeit',
    targetHumidity: 'Zielfeuchtigkeit (%)',
    mistLevel: 'Nebelstufe',
    waterLevel: 'Wasserstand',
    waterTank: 'Wassertank',
    filterLife: 'Filterlebensdauer',
  },
  es: {
    power: 'Encendido',
    speed: 'Velocidad',
    mode: 'Modo',
    oscillation: 'Oscilación',
    temperature: 'Temperatura',
    pm25: 'PM2.5',
    childLock: 'Bloqueo infantil',
    targetTemperature: 'Temperatura objetivo',
    heatLevel: 'Nivel de calor',
    humidity: 'Humedad',
    targetHumidity: 'Humedad objetivo (%)',
    mistLevel: 'Nivel de vapor',
    waterLevel: 'Nivel de agua',
    waterTank: 'Depósito de agua',
    filterLife: 'Vida útil del filtro',
  },
};

/** Labels of the modes offered in the "Mode" selects, by language. */
export const MODE_LABELS = {
  en: {
    normal: 'Normal',
    natural: 'Natural',
    sleep: 'Sleep',
    auto: 'Auto',
    turbo: 'Turbo',
    custom: 'Custom',
    reverse: 'Reverse',
    manual: 'Manual',
    hotair: 'Heat',
    eco: 'Eco',
    coolair: 'Fan only',
  },
  fr: {
    normal: 'Normal',
    natural: 'Naturel',
    sleep: 'Sommeil',
    auto: 'Auto',
    turbo: 'Turbo',
    custom: 'Personnalisé',
    reverse: 'Inversé',
    manual: 'Manuel',
    hotair: 'Chauffage',
    eco: 'Éco',
    coolair: 'Ventilation seule',
  },
  de: {
    normal: 'Normal',
    natural: 'Natürlich',
    sleep: 'Schlaf',
    auto: 'Auto',
    turbo: 'Turbo',
    custom: 'Benutzerdefiniert',
    reverse: 'Umgekehrt',
    manual: 'Manuell',
    hotair: 'Heizen',
    eco: 'Eco',
    coolair: 'Nur Lüfter',
  },
  es: {
    normal: 'Normal',
    natural: 'Natural',
    sleep: 'Sueño',
    auto: 'Automático',
    turbo: 'Turbo',
    custom: 'Personalizado',
    reverse: 'Inverso',
    manual: 'Manual',
    hotair: 'Calefacción',
    eco: 'Eco',
    coolair: 'Solo ventilador',
  },
};

/** Multi-language messages shown in Gladys (action results, refusals, status). */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the e-mail address and the password of your Dreo account.',
    fr: "Saisissez l'adresse e-mail et le mot de passe de votre compte Dreo.",
    de: 'Gib die E-Mail-Adresse und das Passwort deines Dreo-Kontos ein.',
    es: 'Introduzca la dirección de correo y la contraseña de su cuenta Dreo.',
  },
  authRefused: {
    en: 'Dreo refused the e-mail address or the password: check them in the configuration.',
    fr: "Dreo a refusé l'adresse e-mail ou le mot de passe : vérifiez-les dans la configuration.",
    de: 'Dreo hat die E-Mail-Adresse oder das Passwort abgelehnt: Prüfe sie in der Konfiguration.',
    es: 'Dreo ha rechazado la dirección de correo o la contraseña: compruébelas en la configuración.',
  },
  unreachable: {
    en: 'The Dreo cloud cannot be reached: the integration keeps trying.',
    fr: "Le cloud Dreo est injoignable : l'intégration réessaie.",
    de: 'Die Dreo-Cloud ist nicht erreichbar: Die Integration versucht es weiter.',
    es: 'No se puede acceder a la nube de Dreo: la integración sigue intentándolo.',
  },
  heaterPowerOnRefused: {
    en: 'Turning a heater on from Gladys is disabled: enable it in the integration configuration.',
    fr: "Allumer un chauffage depuis Gladys est désactivé : activez-le dans la configuration de l'intégration.",
    de: 'Das Einschalten einer Heizung über Gladys ist deaktiviert: Aktiviere es in der Konfiguration der Integration.',
    es: 'Encender una calefacción desde Gladys está desactivado: actívelo en la configuración de la integración.',
  },
  heaterOff: {
    en: 'The heater is off: turn it on on the device before changing its mode or heat level.',
    fr: "Le chauffage est éteint : allumez-le sur l'appareil avant de changer son mode ou sa puissance.",
    de: 'Die Heizung ist aus: Schalte sie am Gerät ein, bevor du Modus oder Heizstufe änderst.',
    es: 'La calefacción está apagada: enciéndala en el aparato antes de cambiar su modo o su nivel.',
  },
  linkDown: {
    en: 'The link with the Dreo cloud is down: try again in a moment.',
    fr: 'Le lien avec le cloud Dreo est coupé : réessayez dans un instant.',
    de: 'Die Verbindung zur Dreo-Cloud ist unterbrochen: Versuche es gleich noch einmal.',
    es: 'La conexión con la nube de Dreo está cortada: vuelva a intentarlo en un momento.',
  },
  offline: {
    en: 'This Dreo device is offline.',
    fr: 'Cet appareil Dreo est hors ligne.',
    de: 'Dieses Dreo-Gerät ist offline.',
    es: 'Este aparato Dreo está desconectado.',
  },
  noAck: {
    en: 'The Dreo cloud did not confirm the command.',
    fr: "Le cloud Dreo n'a pas confirmé la commande.",
    de: 'Die Dreo-Cloud hat den Befehl nicht bestätigt.',
    es: 'La nube de Dreo no ha confirmado la orden.',
  },
  rejected: {
    en: 'The device refused the command.',
    fr: "L'appareil a refusé la commande.",
    de: 'Das Gerät hat den Befehl abgelehnt.',
    es: 'El aparato ha rechazado la orden.',
  },
  unknownDevice: {
    en: 'Unknown Dreo device: run a new search from the Discovery tab.',
    fr: "Appareil Dreo inconnu : relancez une recherche depuis l'onglet Découverte.",
    de: 'Unbekanntes Dreo-Gerät: Starte eine neue Suche im Tab Erkennung.',
    es: 'Aparato Dreo desconocido: vuelva a buscar desde la pestaña Descubrimiento.',
  },
  invalidValue: {
    en: 'This value is not valid for this device.',
    fr: "Cette valeur n'est pas valable pour cet appareil.",
    de: 'Dieser Wert ist für dieses Gerät nicht gültig.',
    es: 'Este valor no es válido para este aparato.',
  },
};

/** Words of the "Refresh devices" report and of the widget, by language. */
export const WORDS = {
  en: {
    none: 'No Dreo device on this account.',
    found: (count) => `${count} Dreo device(s):`,
    unsupported: 'not supported yet',
    offline: 'offline',
    on: 'on',
    off: 'off',
    speed: 'speed',
    allOff: 'Turn all off',
    turnedOff: (count) => `${count} device(s) turned off.`,
    nothingToTurnOff: 'Nothing to turn off.',
    noDevice: 'No Dreo device added to Gladys yet.',
    disconnected: 'Dreo cloud unreachable',
  },
  fr: {
    none: 'Aucun appareil Dreo sur ce compte.',
    found: (count) => `${count} appareil(s) Dreo :`,
    unsupported: 'pas encore pris en charge',
    offline: 'hors ligne',
    on: 'allumé',
    off: 'éteint',
    speed: 'vitesse',
    allOff: 'Tout éteindre',
    turnedOff: (count) => `${count} appareil(s) éteint(s).`,
    nothingToTurnOff: 'Rien à éteindre.',
    noDevice: "Aucun appareil Dreo ajouté à Gladys pour l'instant.",
    disconnected: 'Cloud Dreo injoignable',
  },
  de: {
    none: 'Kein Dreo-Gerät in diesem Konto.',
    found: (count) => `${count} Dreo-Gerät(e):`,
    unsupported: 'noch nicht unterstützt',
    offline: 'offline',
    on: 'an',
    off: 'aus',
    speed: 'Stufe',
    allOff: 'Alle ausschalten',
    turnedOff: (count) => `${count} Gerät(e) ausgeschaltet.`,
    nothingToTurnOff: 'Nichts auszuschalten.',
    noDevice: 'Noch kein Dreo-Gerät zu Gladys hinzugefügt.',
    disconnected: 'Dreo-Cloud nicht erreichbar',
  },
  es: {
    none: 'Ningún aparato Dreo en esta cuenta.',
    found: (count) => `${count} aparato(s) Dreo:`,
    unsupported: 'aún no compatible',
    offline: 'desconectado',
    on: 'encendido',
    off: 'apagado',
    speed: 'velocidad',
    allOff: 'Apagar todo',
    turnedOff: (count) => `${count} aparato(s) apagado(s).`,
    nothingToTurnOff: 'Nada que apagar.',
    noDevice: 'Aún no se ha añadido ningún aparato Dreo a Gladys.',
    disconnected: 'Nube de Dreo inaccesible',
  },
};

/** An error whose message Gladys shows the user, in every language. */
export class UserError extends Error {
  constructor(key, detail) {
    super(MESSAGES[key].en + (detail ? ` (${detail})` : ''));
    this.name = 'UserError';
    this.key = key;
  }

  /** The message in one language. */
  in(language) {
    return MESSAGES[this.key][language] ?? MESSAGES[this.key].en;
  }
}
