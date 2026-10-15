// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`): every Dreo device of the house on one
// card — on, off or offline, with its mode, speed and temperature — and one
// "Turn all off" button. The core's device widgets show one device at a time
// and cannot turn a whole set off: that is what this card adds.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { currentMode, featureValues, isOn } from './devices.js';
import { MODE_LABELS, WORDS } from './i18n.js';

const MAX_ITEMS = 10; // a `status` component holds 10 rows at most
const ALL_OFF = 'all_off';

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** One row: "on · Sleep · speed 3 · 21.5 °C", "off", "offline". */
export function deviceSummary(dev, language) {
  const words = WORDS[language] ?? WORDS.en;
  if (!dev.connected) {
    return { value: words.offline, color: WIDGET_COLORS.DANGER, icon: 'wifi-off' };
  }
  const on = isOn(dev);
  const values = featureValues(dev);
  const parts = [on ? words.on : words.off];
  const mode = currentMode(dev);
  if (on && mode) {
    parts.push((MODE_LABELS[language] ?? MODE_LABELS.en)[mode] ?? mode);
  }
  if (on && values.speed) {
    parts.push(`${words.speed} ${values.speed.state}`);
  }
  if (values.temperature) {
    parts.push(`${values.temperature.state} °C`);
  } else if (values.humidity) {
    parts.push(`${values.humidity.state} %`);
  }
  return {
    value: truncate(parts.join(' · '), 40),
    color: on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

export function overviewContent(hub, rawLanguage) {
  const language = String(rawLanguage ?? 'en').slice(0, 2);
  const words = WORDS[language] ?? WORDS.en;
  const devices = hub.createdDevices();
  const components = [];
  if (!hub.cloudUp) {
    components.push({ type: 'text', variant: 'caption', text: words.disconnected });
  }
  if (devices.length === 0) {
    components.push({ type: 'text', variant: 'body', text: words.noDevice });
    return { ttl_seconds: 300, components };
  }
  components.push({
    type: 'status',
    items: devices.slice(0, MAX_ITEMS).map((dev) => {
      const { value, color, icon } = deviceSummary(dev, language);
      return { label: truncate(dev.name, 40), value, color, ...(icon ? { icon } : {}) };
    }),
  });
  components.push({
    type: 'button',
    label: words.allOff,
    icon: 'power',
    style: 'danger',
    action: { key: ALL_OFF, confirm: true },
  });
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  overview: {
    get: async (hub, { language }) => overviewContent(hub, language),
    action: async (hub, { actionKey }) => {
      if (actionKey !== ALL_OFF) {
        throw new Error(`Unknown widget action ${actionKey}`);
      }
      const count = await hub.turnAllOff();
      return Object.fromEntries(
        Object.entries(WORDS).map(([lang, words]) => [
          lang,
          count > 0 ? words.turnedOff(count) : words.nothingToTurnOff,
        ]),
      );
    },
  },
};
