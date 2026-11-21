// -----------------------------------------------------------------------------
// Dreo device ↔ Gladys device.
//
//   capabilities(profile, state)   what a device has, read once from its state keys
//   buildDevice(gladys, dev, lang) the device published in the Discovery tab
//   featureValues(dev)             its current values, per feature key
//   buildCommand(dev, key, value)  the Dreo parameters of a Gladys command
//
// A Dreo state is a flat object of keys ("poweron", "windlevel", "mode"...):
// the keys a device reports tell which features it has, the model table
// (src/dreo/models.js) gives the bounds and the modes.
//
// Category/type couples are those the Gladys front knows (checked by
// test/gladys-rules.test.js): there is no `fan/binary`, so the power is a
// `switch/binary`; Dreo modes are not the FAN_MODE scale of Gladys (off, low,
// medium, high, auto), so they are a `text/select` listing the device's own.
//
// Feature keys are forever (external ids): never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
} from '@gladysassistant/integration-sdk';
import { MODE_LABELS, NAMES, UserError } from './i18n.js';

// Gladys LIQUID_STATE values (server/utils/constants.js).
const LIQUID_LOW = 0;
const LIQUID_NORMAL = 1;

const TARGET_HUMIDITY = [30, 90];
const MIST_LEVELS = [1, 6];
const FAN_KINDS = ['tower_fan', 'air_circulator', 'ceiling_fan'];
// Ceiling fan main light (pydreo pydreoceilingfan.py, hass-dreo light.py):
// brightness 1-100, colour temperature a 0-100 percentage of 2700-6500 K.
const LIGHT_BRIGHTNESS = [1, 100];
const KELVIN = [2700, 6500];
// The loads behind the power gate of a ceiling fan.
const LOADS = ['fanon', 'lighton', 'atmon'];

const has = (state, key) => state[key] !== undefined && state[key] !== null;

/** Dreo reports temperatures in °F (pydreo; every fixture too). */
export const fahrenheitToCelsius = (f) => Math.round((((f - 32) * 5) / 9) * 10) / 10;
export const celsiusToFahrenheit = (c) => Math.round((c * 9) / 5 + 32);

/**
 * What a device has, from its model profile and the keys of its state.
 * Computed once per discovery, so the structure stays stable.
 */
export function capabilities(profile, state) {
  const { kind } = profile;
  const caps = { kind };

  if (kind === 'ceiling_fan' && has(state, 'poweron') && has(state, 'fanon')) {
    // Whole-device power gate (pydreo pydreoceilingfan.py): the fan runs when
    // poweron AND fanon; the light and the ambient light hang off the same gate.
    caps.power = { gate: true };
  } else if (has(state, 'poweron') || !has(state, 'fanon')) {
    caps.power = { key: 'poweron' };
  } else {
    caps.power = { key: 'fanon' };
  }

  if (FAN_KINDS.includes(kind) || kind === 'purifier') {
    if (profile.speed && has(state, 'windlevel')) {
      caps.speed = { key: 'windlevel', range: profile.speed };
    }
    const modeKey = kind !== 'purifier' && has(state, 'windtype') ? 'windtype' : 'mode';
    if (profile.modes?.length && has(state, modeKey)) {
      caps.mode = { key: modeKey, modes: profile.modes };
    }
  }

  if (kind === 'ceiling_fan') {
    if (has(state, 'lighton')) {
      caps.light = {
        brightness: has(state, 'brightness'),
        colorTemperature: has(state, 'colortemp'),
      };
    }
    if (has(state, 'atmon')) {
      caps.ambient = {
        brightness: has(state, 'atmbri') ? profile.atmBrightness : null,
        // Only the direct RGB path: units without `atmcolor` take colours
        // through an effect API this integration does not drive.
        color: has(state, 'atmcolor'),
      };
    }
  }

  if (kind === 'tower_fan') {
    const key = ['shakehorizon', 'oscon'].find((k) => has(state, k));
    if (key) {
      caps.oscillation = { keys: [key], max: 1 };
    }
  } else if (kind === 'air_circulator') {
    if (has(state, 'oscmode')) {
      // Same bitmap as the Gladys FAN_ROCK_SETTING: 1 left-right, 2 up-down.
      caps.oscillation = { keys: ['oscmode'], max: 3 };
    } else if (has(state, 'hoscon')) {
      const keys = has(state, 'voscon') ? ['hoscon', 'voscon'] : ['hoscon'];
      caps.oscillation = { keys, max: keys.length === 2 ? 3 : 1 };
    }
  }

  if (kind === 'heater') {
    caps.heaterCombo = typeof state.mode === 'number';
    caps.mode = { key: 'mode', modes: profile.modes };
    if (has(state, 'htalevel') && profile.heatLevels) {
      caps.heatLevel = { range: profile.heatLevels };
    }
    if (has(state, 'ecolevel') && profile.ecoF) {
      caps.targetTemperature = {
        range: profile.ecoF.map((f) => Math.round(fahrenheitToCelsius(f))),
        rangeF: profile.ecoF,
      };
    }
  }

  if (kind === 'humidifier') {
    if (has(state, 'mode')) {
      caps.mode = { key: 'mode', modes: profile.modes };
    }
    if (has(state, 'rh')) {
      caps.humidity = true;
    }
    if (has(state, 'rhautolevel')) {
      caps.targetHumidity = { sleepKey: has(state, 'rhsleeplevel') ? 'rhsleeplevel' : null };
    }
    if (has(state, 'foglevel')) {
      caps.mistLevel = true;
    }
    if (has(state, 'waterlevel')) {
      caps.waterLevel = true;
    } else if (has(state, 'wrong')) {
      caps.waterTank = true; // "wrong" is the tank status on humidifiers (pydreo)
    }
  }

  if (kind !== 'purifier' && kind !== 'humidifier' && has(state, 'temperature')) {
    caps.temperature = true;
  }
  if (has(state, 'pm25')) {
    caps.pm25 = true;
  }
  if (kind === 'purifier' && profile.filterLifePercent && has(state, 'lifetime')) {
    caps.filterLife = true;
  }
  if (has(state, 'childlockon')) {
    caps.childLock = true;
  }
  return caps;
}

/** The ids of a Dreo device: its serial number is its identity at Dreo. */
export function deviceIds(gladys, sn) {
  return gladys.externalIds('dreo', String(sn).replace(/[^A-Za-z0-9_.-]/g, '_'));
}

function feature(ids, key, name, spec) {
  return {
    name,
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: true,
    keep_history: true,
    min: 0,
    max: 0,
    ...spec,
  };
}

/** The mode options of a device, labelled in the configured language. */
function modeOptions(modes, language) {
  const labels = MODE_LABELS[language] ?? MODE_LABELS.en;
  return modes.map(([name], index) => ({
    value: name,
    label: labels[name] ?? name,
    sort_order: index,
  }));
}

/**
 * The Gladys device of a Dreo device.
 * @param {object} gladys GladysIntegration (for the external ids)
 * @param {object} dev { sn, name, model, caps }
 * @param {string} language feature-name language
 */
export function buildDevice(gladys, dev, language) {
  const ids = deviceIds(gladys, dev.sn);
  const n = NAMES[language] ?? NAMES.en;
  const { caps } = dev;
  const features = [];

  features.push(
    feature(ids, 'power', n.power, {
      category: C.SWITCH,
      type: T.SWITCH.BINARY,
      read_only: false,
      max: 1,
    }),
  );
  if (caps.speed) {
    features.push(
      feature(ids, 'speed', n.speed, {
        category: C.FAN,
        type: T.FAN.SPEED,
        read_only: false,
        min: caps.speed.range[0],
        max: caps.speed.range[1],
      }),
    );
  }
  if (caps.mode) {
    features.push(
      feature(ids, 'mode', n.mode, {
        category: C.TEXT,
        type: T.TEXT.SELECT,
        read_only: false,
        keep_history: false,
        supported_options: modeOptions(caps.mode.modes, language),
      }),
    );
  }
  if (caps.oscillation) {
    features.push(
      feature(ids, 'oscillation', n.oscillation, {
        category: C.FAN,
        type: T.FAN.ROCK_SETTING,
        read_only: false,
        max: caps.oscillation.max,
      }),
    );
  }
  if (caps.light) {
    features.push(
      feature(ids, 'light', n.light, {
        category: C.LIGHT,
        type: T.LIGHT.BINARY,
        read_only: false,
        max: 1,
      }),
    );
    if (caps.light.brightness) {
      features.push(
        feature(ids, 'light-brightness', n.lightBrightness, {
          category: C.LIGHT,
          type: T.LIGHT.BRIGHTNESS,
          read_only: false,
          min: LIGHT_BRIGHTNESS[0],
          max: LIGHT_BRIGHTNESS[1],
        }),
      );
    }
    if (caps.light.colorTemperature) {
      features.push(
        feature(ids, 'light-temperature', n.lightTemperature, {
          category: C.LIGHT,
          type: T.LIGHT.TEMPERATURE,
          unit: 'kelvin',
          read_only: false,
          min: KELVIN[0],
          max: KELVIN[1],
        }),
      );
    }
  }
  if (caps.ambient) {
    features.push(
      feature(ids, 'ambient-light', n.ambientLight, {
        category: C.LIGHT,
        type: T.LIGHT.BINARY,
        read_only: false,
        max: 1,
      }),
    );
    if (caps.ambient.brightness) {
      features.push(
        feature(ids, 'ambient-brightness', n.ambientBrightness, {
          category: C.LIGHT,
          type: T.LIGHT.BRIGHTNESS,
          read_only: false,
          min: caps.ambient.brightness[0],
          max: caps.ambient.brightness[1],
        }),
      );
    }
    if (caps.ambient.color) {
      features.push(
        feature(ids, 'ambient-color', n.ambientColor, {
          category: C.LIGHT,
          type: T.LIGHT.COLOR,
          read_only: false,
          keep_history: false,
          max: 0xffffff,
        }),
      );
    }
  }
  if (caps.heatLevel) {
    const [low, high] = caps.heatLevel.range;
    features.push(
      feature(ids, 'heat-level', n.heatLevel, {
        category: C.TEXT,
        type: T.TEXT.SELECT,
        read_only: false,
        keep_history: false,
        supported_options: Array.from({ length: high - low + 1 }, (_, i) => ({
          value: String(low + i),
          label: `H${low + i}`,
          sort_order: i,
        })),
      }),
    );
  }
  if (caps.targetTemperature) {
    features.push(
      feature(ids, 'target-temperature', n.targetTemperature, {
        category: C.THERMOSTAT,
        type: T.THERMOSTAT.TARGET_TEMPERATURE,
        unit: 'celsius',
        read_only: false,
        min: caps.targetTemperature.range[0],
        max: caps.targetTemperature.range[1],
        step: 1,
      }),
    );
  }
  if (caps.targetHumidity) {
    features.push(
      feature(ids, 'target-humidity', n.targetHumidity, {
        category: C.SWITCH,
        type: T.SWITCH.DIMMER,
        read_only: false,
        min: TARGET_HUMIDITY[0],
        max: TARGET_HUMIDITY[1],
      }),
    );
  }
  if (caps.mistLevel) {
    features.push(
      feature(ids, 'mist-level', n.mistLevel, {
        category: C.FAN,
        type: T.FAN.SPEED,
        read_only: false,
        min: MIST_LEVELS[0],
        max: MIST_LEVELS[1],
      }),
    );
  }
  if (caps.temperature) {
    features.push(
      feature(ids, 'temperature', n.temperature, {
        category: C.TEMPERATURE_SENSOR,
        type: T.SENSOR.DECIMAL,
        unit: 'celsius',
        min: -20,
        max: 60,
      }),
    );
  }
  if (caps.humidity) {
    features.push(
      feature(ids, 'humidity', n.humidity, {
        category: C.HUMIDITY_SENSOR,
        type: T.SENSOR.DECIMAL,
        unit: 'percent',
        max: 100,
      }),
    );
  }
  if (caps.pm25) {
    features.push(
      feature(ids, 'pm25', n.pm25, {
        category: C.PM25_SENSOR,
        type: T.SENSOR.DECIMAL,
        unit: 'microgram-per-cubic-meter',
        max: 1000,
      }),
    );
  }
  if (caps.waterLevel) {
    features.push(
      feature(ids, 'water-level', n.waterLevel, {
        category: C.LEVEL_SENSOR,
        type: T.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
        unit: 'percent',
        max: 100,
      }),
    );
  }
  if (caps.waterTank) {
    features.push(
      feature(ids, 'water-tank', n.waterTank, {
        category: C.LEVEL_SENSOR,
        type: T.LEVEL_SENSOR.LIQUID_STATE,
        max: 2,
      }),
    );
  }
  if (caps.filterLife) {
    features.push(
      feature(ids, 'filter-life', n.filterLife, {
        category: C.HEPA_FILTER_MONITORING,
        type: T.FILTER_MONITORING.FILTER_LIFE_REMAINING,
        unit: 'percent',
        max: 100,
      }),
    );
  }
  if (caps.childLock) {
    // Read-only on purpose: reported, never driven from Gladys.
    features.push(
      feature(ids, 'child-lock', n.childLock, {
        category: C.CHILD_LOCK,
        type: T.CHILD_LOCK.BINARY,
        max: 1,
      }),
    );
  }

  return {
    name: dev.name,
    external_id: ids.device,
    model: dev.model,
    // No core polling: the states arrive over the Dreo WebSocket, and the
    // container refreshes them itself (src/hub.js). See CLAUDE.md, #3198.
    should_poll: false,
    features,
  };
}

/** Name of a mode value, per the device's mode list. */
function modeName(modes, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const exact = modes.find(([, v]) => v === value);
  if (exact) {
    return exact[0];
  }
  // Purifiers report variants ("auto-regular", "auto-silent") of a base mode.
  const base = typeof value === 'string' ? value.split('-')[0] : value;
  return modes.find(([, v]) => v === base)?.[0] ?? null;
}

/** Whether a load behind the power gate is lit or running, or null when unknown. */
function loadOn({ state, caps }, load) {
  if (!has(state, load)) {
    return null;
  }
  // Without a gate (DR-HCF001S), the load key alone tells.
  return (!caps.power.gate || state.poweron !== false) && state[load] === true;
}

/** Whether the device runs (the "power" feature), or null when unknown. */
export function isOn(dev) {
  const { state, caps } = dev;
  if (caps.power.gate) {
    return loadOn(dev, 'fanon');
  }
  return has(state, caps.power.key) ? state[caps.power.key] === true : null;
}

/** Dreo colour temperature (0-100 %, warm to cold) ↔ Gladys kelvin. */
export const percentToKelvin = (p) => Math.round(KELVIN[0] + ((KELVIN[1] - KELVIN[0]) * p) / 100);
export const kelvinToPercent = (k) =>
  Math.min(100, Math.max(0, Math.round(((k - KELVIN[0]) * 100) / (KELVIN[1] - KELVIN[0]))));

/** The current mode name (heaters: hotair, eco, coolair). */
export function currentMode(dev) {
  const { state, caps } = dev;
  if (!caps.mode) {
    return null;
  }
  if (caps.heaterCombo) {
    if (state.mode === 2) {
      return 'coolair';
    }
    return state.htamode === 2 ? 'eco' : state.mode === 1 ? 'hotair' : null;
  }
  return modeName(caps.mode.modes, state[caps.mode.key]);
}

function oscillationValue({ state, caps }) {
  const [first, second] = caps.oscillation.keys;
  if (first === 'oscmode') {
    return Number.isInteger(state.oscmode) ? state.oscmode & 3 : null;
  }
  if (!has(state, first)) {
    return null;
  }
  return (state[first] ? 1 : 0) | (second && state[second] ? 2 : 0);
}

/** Where the humidity target of the current mode lives. */
function targetHumidityKey({ state, caps }) {
  const sleep = caps.mode?.modes.find(([name]) => name === 'sleep')?.[1];
  return caps.targetHumidity.sleepKey && state.mode === sleep
    ? caps.targetHumidity.sleepKey
    : 'rhautolevel';
}

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The current values of a device, by feature key: `{ state }` for numbers,
 * `{ text }` for the selects. A value the device did not report is absent.
 */
export function featureValues(dev) {
  const { state, caps } = dev;
  const values = {};
  const put = (key, value) => {
    if (value !== null && value !== undefined) {
      values[key] = { state: value };
    }
  };
  const on = isOn(dev);
  put('power', on === null ? null : on ? 1 : 0);
  if (caps.speed) {
    put('speed', number(state.windlevel));
  }
  const mode = currentMode(dev);
  if (mode) {
    values.mode = { text: mode };
  }
  if (caps.oscillation) {
    put('oscillation', oscillationValue(dev));
  }
  if (caps.light) {
    const lit = loadOn(dev, 'lighton');
    put('light', lit === null ? null : lit ? 1 : 0);
    if (caps.light.brightness) {
      put('light-brightness', number(state.brightness));
    }
    if (caps.light.colorTemperature && number(state.colortemp) !== null) {
      put('light-temperature', percentToKelvin(state.colortemp));
    }
  }
  if (caps.ambient) {
    const lit = loadOn(dev, 'atmon');
    put('ambient-light', lit === null ? null : lit ? 1 : 0);
    if (caps.ambient.brightness) {
      put('ambient-brightness', number(state.atmbri));
    }
    if (caps.ambient.color) {
      put('ambient-color', number(state.atmcolor));
    }
  }
  if (caps.heatLevel && number(state.htalevel) !== null) {
    values['heat-level'] = { text: String(state.htalevel) };
  }
  if (caps.targetTemperature && number(state.ecolevel) !== null) {
    put('target-temperature', Math.round(fahrenheitToCelsius(state.ecolevel)));
  }
  if (caps.targetHumidity) {
    put('target-humidity', number(state[targetHumidityKey(dev)]));
  }
  if (caps.mistLevel) {
    put('mist-level', number(state.foglevel));
  }
  if (caps.temperature && number(state.temperature) !== null) {
    put('temperature', fahrenheitToCelsius(state.temperature));
  }
  if (caps.humidity) {
    put('humidity', number(state.rh));
  }
  if (caps.pm25) {
    put('pm25', number(state.pm25));
  }
  if (caps.waterLevel) {
    put('water-level', number(state.waterlevel));
  }
  if (caps.waterTank) {
    // 0 = water present; 1 and 4 = tank empty (pydreo WATER_LEVEL_STATUS_MAP).
    put(
      'water-tank',
      state.wrong === 0 ? LIQUID_NORMAL : [1, 4].includes(state.wrong) ? LIQUID_LOW : null,
    );
  }
  if (caps.filterLife) {
    put('filter-life', number(state.lifetime));
  }
  if (caps.childLock && typeof state.childlockon === 'boolean') {
    put('child-lock', state.childlockon ? 1 : 0);
  }
  return values;
}

function integerIn(value, [low, high]) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.round(n) < low || Math.round(n) > high) {
    throw new UserError('invalidValue', `${value} not in ${low}-${high}`);
  }
  return Math.round(n);
}

/** The Dreo command of the purifier "auto" mode, which some revisions refuse as is. */
function purifierAutoCommand(dev) {
  if (dev.profile.autoCommand) {
    return dev.profile.autoCommand;
  }
  const reported = dev.state.mode;
  return typeof reported === 'string' && reported.startsWith('auto-') ? reported : 'auto';
}

/**
 * Switches one load of a ceiling fan behind its power gate (pydreo
 * pydreoceilingfan.py): opening the gate re-energises every retained load, so
 * waking one load forces the others off; the device never closes the gate by
 * itself, so the last load off must.
 */
function loadCommand(dev, load, on) {
  const { state, caps } = dev;
  if (!caps.power.gate) {
    return { [load]: on };
  }
  const others = LOADS.filter((other) => other !== load && has(state, other));
  if (on) {
    if (state.poweron === false) {
      const params = { poweron: true, [load]: true };
      for (const other of others) {
        params[other] = false;
      }
      return params;
    }
    return { [load]: true };
  }
  const otherLoadOn = others.some((other) => state[other] === true);
  return state.poweron === true && !otherLoadOn
    ? { [load]: false, poweron: false }
    : { [load]: false };
}

function powerCommand(dev, on) {
  const { caps } = dev;
  return loadCommand(dev, caps.power.gate ? 'fanon' : caps.power.key, on);
}

/**
 * The Dreo parameters of a Gladys command.
 * @param {object} dev { state, caps, profile }
 * @param {string} key feature key
 * @param {number|string} value the Gladys value
 * @param {{ heater_remote_power_on: boolean }} config
 * @throws {UserError} a value or an action the integration refuses
 */
export function buildCommand(dev, key, value, config) {
  const { state, caps } = dev;
  const heater = caps.kind === 'heater';
  const heaterOff = heater && state.poweron === false;

  switch (key) {
    case 'power': {
      const on = Number(value) === 1;
      if (on && heater && !config.heater_remote_power_on) {
        throw new UserError('heaterPowerOnRefused');
      }
      return powerCommand(dev, on);
    }
    case 'speed':
      if (!caps.speed) break;
      return { windlevel: integerIn(value, caps.speed.range) };
    case 'mist-level':
      if (!caps.mistLevel) break;
      return { foglevel: integerIn(value, MIST_LEVELS) };
    case 'mode': {
      if (!caps.mode) break;
      const name = String(value);
      const entry = caps.mode.modes.find(([n]) => n === name);
      if (!entry) {
        throw new UserError('invalidValue', name);
      }
      if (heaterOff && !config.heater_remote_power_on) {
        // Unverified on every model whether a mode command wakes the heater up.
        throw new UserError('heaterOff');
      }
      if (caps.heaterCombo) {
        return {
          coolair: { mode: 2 },
          hotair: { mode: 1, htamode: 1 },
          eco: { mode: 1, htamode: 2 },
        }[name];
      }
      if (caps.kind === 'purifier' && name === 'auto') {
        return { mode: purifierAutoCommand(dev) };
      }
      return { [caps.mode.key]: entry[1] };
    }
    case 'oscillation': {
      if (!caps.oscillation) break;
      const bits = integerIn(value, [0, caps.oscillation.max]);
      const [first, second] = caps.oscillation.keys;
      if (first === 'oscmode') {
        return { oscmode: bits };
      }
      const params = { [first]: (bits & 1) === 1 };
      if (second) {
        params[second] = (bits & 2) === 2;
      }
      return params;
    }
    case 'light':
      if (!caps.light) break;
      return loadCommand(dev, 'lighton', Number(value) === 1);
    case 'light-brightness':
      // Parameters only: never wakes the light (pydreo does the same).
      if (!caps.light?.brightness) break;
      return { brightness: integerIn(value, LIGHT_BRIGHTNESS) };
    case 'light-temperature': {
      if (!caps.light?.colorTemperature) break;
      const kelvin = Number(value);
      if (!Number.isFinite(kelvin)) {
        throw new UserError('invalidValue', String(value));
      }
      return { colortemp: kelvinToPercent(kelvin) };
    }
    case 'ambient-light':
      if (!caps.ambient) break;
      return loadCommand(dev, 'atmon', Number(value) === 1);
    case 'ambient-brightness':
      if (!caps.ambient?.brightness) break;
      return { atmbri: integerIn(value, caps.ambient.brightness) };
    case 'ambient-color':
      if (!caps.ambient?.color) break;
      return { atmcolor: integerIn(value, [0, 0xffffff]) };
    case 'heat-level':
      if (!caps.heatLevel) break;
      if (heaterOff && !config.heater_remote_power_on) {
        throw new UserError('heaterOff');
      }
      return { htalevel: integerIn(value, caps.heatLevel.range) };
    case 'target-temperature': {
      if (!caps.targetTemperature) break;
      const celsius = Number(value);
      const [lowF, highF] = caps.targetTemperature.rangeF;
      if (!Number.isFinite(celsius)) {
        throw new UserError('invalidValue', String(value));
      }
      return { ecolevel: Math.min(highF, Math.max(lowF, celsiusToFahrenheit(celsius))) };
    }
    case 'target-humidity':
      if (!caps.targetHumidity) break;
      return { [targetHumidityKey(dev)]: integerIn(value, TARGET_HUMIDITY) };
    default:
      break;
  }
  // Sensors and the child lock are read-only.
  throw new UserError('invalidValue', key);
}
