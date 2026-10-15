// -----------------------------------------------------------------------------
// What a Dreo model can do: its kind, the bounds of its fan speed, its modes.
//
// The device list of the cloud describes most models (`controlsConf`: a
// "Speed" control with its bounds, a "Mode" control with its values), but
// many recent models come with an empty `controlsConf`. For those, the table
// below gives the values pydreo established with their owners
// (JeffSteinbok/hass-dreo, custom_components/dreo/pydreo/models.py, MIT —
// "Copyright (c) 2023 Jeff Steinbok, Andy Cooper"). A model in neither keeps
// the defaults of its kind; the feature bounds are display bounds only.
// -----------------------------------------------------------------------------

export const KINDS = [
  'tower_fan',
  'air_circulator',
  'ceiling_fan',
  'heater',
  'purifier',
  'humidifier',
];

const PREFIXES = [
  ['DR-HTF', 'tower_fan'],
  ['DR-HAF', 'air_circulator'],
  ['DR-HPF', 'air_circulator'],
  ['DR-HCF', 'ceiling_fan'],
  ['DR-HSH', 'heater'],
  ['WH', 'heater'],
  ['DR-HAP', 'purifier'],
  ['DR-HHM', 'humidifier'],
];

/** The kind of a model, or null for the models this integration does not drive. */
export function kindOfModel(model) {
  const name = String(model ?? '').toUpperCase();
  return PREFIXES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

// The words of the Dreo app (controlsConf texts) → the mode names used here.
// Same mapping as pydreo's PRESET_MODE_STRINGS.
const MODE_WORDS = {
  device_fans_mode_straight: 'normal',
  device_control_mode_manual: 'normal',
  device_fans_mode_natural: 'natural',
  device_control_mode_sleep: 'sleep',
  device_fans_mode_sleep: 'sleep',
  device_fans_mode_auto: 'auto',
  device_control_mode_auto: 'auto',
  base_auto: 'auto',
  device_control_mode_turbo: 'turbo',
  device_fans_mode_turbo: 'turbo',
  base_reverse: 'reverse',
  device_control_custom: 'custom',
  device_heater_mode_heat: 'hotair',
  device_heater_mode_eco: 'eco',
  device_heater_mode_fan_only: 'coolair',
};

const FAN_MODES = [
  ['normal', 1],
  ['natural', 2],
  ['sleep', 3],
  ['auto', 4],
];
const CIRCULATOR_MODES = [...FAN_MODES, ['turbo', 5], ['custom', 6]];
const CEILING_MODES = [
  ['normal', 1],
  ['natural', 2],
  ['sleep', 3],
  ['reverse', 4],
];
const PURIFIER_MODES = [
  ['auto', 'auto'],
  ['manual', 'manual'],
  ['sleep', 'sleep'],
  ['turbo', 'turbo'],
];
const HUMIDIFIER_MODES = [
  ['normal', 0],
  ['auto', 1],
  ['sleep', 2],
];
const HEATER_MODES = [
  ['hotair', 'hotair'],
  ['eco', 'eco'],
  ['coolair', 'coolair'],
];

/** Defaults of a kind, when neither the cloud nor the table knows better. */
const KIND_DEFAULTS = {
  tower_fan: { speed: [1, 9], modes: FAN_MODES },
  air_circulator: { speed: [1, 9], modes: CIRCULATOR_MODES },
  ceiling_fan: { speed: [1, 12], modes: CEILING_MODES },
  purifier: { speed: [1, 4], modes: PURIFIER_MODES },
  humidifier: { modes: HUMIDIFIER_MODES },
  heater: { heatLevels: [1, 3], ecoF: [41, 95], modes: HEATER_MODES },
};

// Per model (pydreo models.py). `autoCommand`: the purifiers that refuse the
// plain "auto" mode command (error 500003) and want this variant instead.
const MODEL_TABLE = {
  'DR-HTF007S': { speed: [1, 8], modes: FAN_MODES },
  'DR-HTF011S': { speed: [1, 9], modes: FAN_MODES },
  'DR-HTF017S': { speed: [1, 4], modes: FAN_MODES },
  'DR-HTF018S': { speed: [1, 9], modes: FAN_MODES },
  'DR-HTF021S': { speed: [1, 12], modes: FAN_MODES },
  'DR-HTF021AS': { speed: [1, 12], modes: FAN_MODES },
  'DR-HTF024S': { speed: [1, 9], modes: FAN_MODES },
  'DR-HTF518S': { speed: [1, 9], modes: FAN_MODES },
  'DR-HAF001S': { speed: [1, 4], modes: FAN_MODES },
  'DR-HAF008S': { speed: [1, 9], modes: [...FAN_MODES, ['turbo', 5]] },
  'DR-HPF004S': { speed: [1, 9], modes: CIRCULATOR_MODES },
  'DR-HPF005S': { speed: [1, 10], modes: CIRCULATOR_MODES },
  'DR-HPF007S': { speed: [1, 10], modes: CIRCULATOR_MODES },
  'DR-HPF008S': { speed: [1, 9], modes: [...FAN_MODES, ['turbo', 5]] },
  'DR-HPF015S': { speed: [1, 12], modes: CIRCULATOR_MODES },
  'DR-HPF017S': {
    speed: [1, 12],
    modes: [
      ['normal', 1],
      ['auto', 2],
      ['sleep', 3],
      ['natural', 4],
      ['turbo', 5],
      ['custom', 6],
    ],
  },
  'DR-HPF020S': { speed: [1, 9], modes: CIRCULATOR_MODES },
  'DR-HPF022S': { speed: [1, 9], modes: [...FAN_MODES, ['turbo', 5]] },
  'DR-HPF025S': {
    speed: [1, 9],
    modes: [
      ['normal', 1],
      ['auto', 2],
      ['sleep', 3],
      ['natural', 4],
      ['turbo', 5],
    ],
  },
  'DR-HCF001S': { speed: [1, 12], modes: CEILING_MODES },
  'DR-HCF002S': { speed: [1, 12] },
  'DR-HCF007S': { speed: [1, 12], modes: CEILING_MODES },
  'DR-HCF008S': { speed: [1, 12], modes: CEILING_MODES },
  'DR-HCF010S': { speed: [1, 12], modes: CEILING_MODES },
  'DR-HCF521S': { speed: [1, 12] },
  'DR-HAP006S': { speed: [1, 4], modes: PURIFIER_MODES, autoCommand: 'auto-regular' },
  'DR-HAP007S': {
    speed: [1, 4],
    modes: PURIFIER_MODES,
    autoCommand: 'auto-regular',
    filterLifePercent: true,
  },
  'DR-HAP008S': { speed: [1, 4], modes: PURIFIER_MODES, autoCommand: 'auto-regular' },
  'DR-HAP009S': { speed: [1, 4], modes: PURIFIER_MODES, autoCommand: 'auto-regular' },
  'DR-HAP010S': { speed: [1, 4], modes: PURIFIER_MODES, autoCommand: 'auto-regular' },
  'DR-HSH016S': { heatLevels: [1, 5] },
  'DR-HSH017BS': { ecoF: [41, 85] },
  'DR-HHM005S': { modes: HUMIDIFIER_MODES },
  'DR-HHM006S': { modes: HUMIDIFIER_MODES },
  'DR-HHM014S': { modes: HUMIDIFIER_MODES },
};

// DR-HAP003S revisions told apart by their MCU (pydreo _hap003s_mcu_override).
const HAP003S_AUTO_BY_MCU = {
  midea: 'auto-silent',
  '001': 'auto-silent',
  'SC95F8616B-2/US': 'auto-regular',
};

/** The "Speed" bounds of controlsConf, wherever the app puts them. */
function speedFromControls(entry, kind) {
  const conf = entry?.controlsConf ?? {};
  const nodes = [
    ...(conf.extraConfigs ?? [])
      .filter((item) => item?.key === 'control')
      .map((item) => item.value),
    conf.control,
  ].filter(Array.isArray);
  for (const node of nodes) {
    for (const item of node) {
      // Purifiers put their bounds on the "manual" mode entry.
      const isSpeed = kind === 'purifier' ? item?.value === 'manual' : item?.type === 'Speed';
      const [low, high] = item?.items ?? [];
      if (isSpeed && Number.isInteger(low?.value) && Number.isInteger(high?.value)) {
        return [low.value, high.value];
      }
    }
  }
  return null;
}

/** The modes of controlsConf: [name, value] pairs, sorted by value. */
function modesFromControls(entry, kind) {
  const conf = entry?.controlsConf ?? {};
  const modes = [];
  const add = (word, value) => {
    // A purifier's "manual" is its own mode, not the "normal" of a fan.
    const name =
      kind === 'purifier' && word === 'device_control_mode_manual' ? 'manual' : MODE_WORDS[word];
    const base = typeof value === 'string' ? value.split('-')[0] : value;
    if (
      name &&
      base !== null &&
      base !== undefined &&
      !modes.some(([n, v]) => n === name || v === base)
    ) {
      modes.push([name, base]);
    }
  };
  for (const item of conf.control ?? []) {
    if (item?.type === 'Mode' || (kind === 'ceiling_fan' && item?.type === 'CFFan')) {
      for (const mode of item.items ?? []) {
        add(mode.text, mode.value);
      }
    } else if (kind === 'purifier' && item?.type === 'Manual') {
      add('device_control_mode_manual', item.value);
    }
  }
  // The scheduler lists "auto-regular" for "auto": `add` keeps the base value.
  for (const mode of conf.schedule?.modes ?? []) {
    add(mode.title, mode.value);
  }
  if (modes.length === 0) {
    return null;
  }
  // Numbered modes in the device's order; named ones (heaters, purifiers) as listed.
  return modes.every(([, v]) => typeof v === 'number') ? modes.sort((a, b) => a[1] - b[1]) : modes;
}

/**
 * Everything the integration needs to know about a model.
 * @param {object} entry a device of the cloud device list
 * @param {object} state its flattened state (src/dreo/api.js)
 */
export function modelProfile(entry, state = {}) {
  const model = String(entry?.model ?? '').toUpperCase();
  const kind = kindOfModel(model);
  if (!kind) {
    return null;
  }
  const defaults = KIND_DEFAULTS[kind];
  const table = MODEL_TABLE[model] ?? {};
  const profile = {
    kind,
    model,
    speed: table.speed ?? speedFromControls(entry, kind) ?? defaults.speed ?? null,
    modes: table.modes ?? modesFromControls(entry, kind) ?? defaults.modes,
    heatLevels: table.heatLevels ?? defaults.heatLevels ?? null,
    ecoF: table.ecoF ?? defaults.ecoF ?? null,
    autoCommand: table.autoCommand ?? null,
    filterLifePercent: table.filterLifePercent === true,
  };
  if (model === 'DR-HTF007S' && /^CMS89F7518/.test(String(state.mcu_hardware_model ?? ''))) {
    profile.speed = [1, 4]; // older revision of the Nomad One S (pydreo)
  }
  if (model === 'DR-HAP003S') {
    profile.autoCommand = HAP003S_AUTO_BY_MCU[state.mcu_hardware_model] ?? null;
  }
  if (kind === 'heater' && profile.modes.length === 0) {
    profile.modes = HEATER_MODES;
  }
  return profile;
}
