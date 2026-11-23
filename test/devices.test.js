// -----------------------------------------------------------------------------
// Dreo device → Gladys features, values and commands, on the real fixtures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommand,
  capabilities,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  featureValues,
} from '../src/devices.js';
import { kindOfModel, modelProfile } from '../src/dreo/models.js';
import { loadDeviceList, loadStates } from './helpers/fakeDreo.js';

const entries = loadDeviceList();
const states = loadStates();
const ALLOWED = { heater_remote_power_on: true };
const DEFAULT = { heater_remote_power_on: false };

/** A device record like the hub keeps, from a fixture serial number. */
function dev(sn, overrides = {}) {
  const entry = entries.find((e) => e.sn === sn);
  const state = Object.fromEntries(
    Object.entries(states[sn]).map(([k, v]) => [
      k,
      v && typeof v === 'object' && 'state' in v ? v.state : v,
    ]),
  );
  Object.assign(state, overrides);
  const profile = modelProfile(entry, state);
  return {
    sn,
    name: entry.deviceName,
    profile,
    caps: capabilities(profile, state),
    state,
    connected: true,
  };
}

test('models are sorted into kinds by their prefix, the others are left out', () => {
  assert.equal(kindOfModel('DR-HTF017S'), 'tower_fan');
  assert.equal(kindOfModel('DR-HPF008S'), 'air_circulator');
  assert.equal(kindOfModel('DR-HCF002S'), 'ceiling_fan');
  assert.equal(kindOfModel('DR-HSH009S'), 'heater');
  assert.equal(kindOfModel('DR-HAP007S'), 'purifier');
  assert.equal(kindOfModel('DR-HHM014S'), 'humidifier');
  assert.equal(kindOfModel('DR-HAC005S'), null);
  assert.equal(kindOfModel('DR-HDH002S'), 'dehumidifier');
  assert.equal(kindOfModel(undefined), null);
});

test('temperatures: Dreo reports °F, Gladys gets °C', () => {
  assert.equal(fahrenheitToCelsius(75), 23.9);
  assert.equal(fahrenheitToCelsius(68), 20);
  assert.equal(celsiusToFahrenheit(20), 68);
  assert.equal(celsiusToFahrenheit(5), 41);
  assert.equal(celsiusToFahrenheit(35), 95);
});

test('tower fan: power, speed of the model table, mode, oscillation, temperature', () => {
  const fan = dev('HTF017S_1');
  assert.deepEqual(fan.caps.speed.range, [1, 4]); // empty controlsConf: pydreo's table
  assert.equal(fan.caps.mode.key, 'windtype');
  assert.deepEqual(featureValues(fan), {
    power: { state: 0 },
    speed: { state: 4 },
    mode: { text: 'normal' },
    oscillation: { state: 0 },
    temperature: { state: 23.9 },
  });
  assert.deepEqual(buildCommand(fan, 'power', 1, DEFAULT), { poweron: true });
  assert.deepEqual(buildCommand(fan, 'speed', 3, DEFAULT), { windlevel: 3 });
  assert.deepEqual(buildCommand(fan, 'mode', 'sleep', DEFAULT), { windtype: 3 });
  assert.deepEqual(buildCommand(fan, 'oscillation', 1, DEFAULT), { shakehorizon: true });
  assert.throws(() => buildCommand(fan, 'speed', 5, DEFAULT), /not valid/);
  assert.throws(() => buildCommand(fan, 'mode', 'turbo', DEFAULT), /not valid/);
  assert.throws(() => buildCommand(fan, 'temperature', 20, DEFAULT), /not valid/);
});

test('tower fan: speed bounds read from controlsConf when the table has none', () => {
  assert.deepEqual(dev('HTF008S_1').caps.speed.range, [1, 5]);
});

test('air circulator: oscmode is the Gladys rock-setting bitmap', () => {
  const fan = dev('HAF004S_1');
  assert.equal(fan.caps.oscillation.max, 3);
  assert.equal(featureValues(fan).oscillation.state, 2); // vertical only
  assert.deepEqual(buildCommand(fan, 'oscillation', 3, DEFAULT), { oscmode: 3 });
  assert.deepEqual(buildCommand(fan, 'mode', 'turbo', DEFAULT), { mode: 5 });
});

test('air circulator, older firmware: two oscillation switches', () => {
  const fan = dev('HAF003S_2');
  assert.deepEqual(fan.caps.oscillation.keys, ['hoscon', 'voscon']);
  assert.deepEqual(buildCommand(fan, 'oscillation', 1, DEFAULT), { hoscon: true, voscon: false });
  assert.deepEqual(buildCommand(fan, 'oscillation', 2, DEFAULT), { hoscon: false, voscon: true });
});

test('air circulator without poweron: fanon is its power', () => {
  const fan = dev('HPF008S_1');
  assert.equal(fan.caps.power.key, 'fanon');
  assert.equal(featureValues(fan).power.state, 1);
  assert.deepEqual(buildCommand(fan, 'power', 0, DEFAULT), { fanon: false });
});

test('ceiling fan with a power gate: on means poweron AND fanon', () => {
  // The fixture: gate closed, fan retained on.
  const fan = dev('HCF002S_POWERON_OFF_1');
  assert.equal(fan.caps.power.gate, true);
  assert.equal(featureValues(fan).power.state, 0);
  // Waking the fan alone: the retained light and ambient light stay off.
  assert.deepEqual(buildCommand(fan, 'power', 1, DEFAULT), {
    poweron: true,
    fanon: true,
    lighton: false,
    atmon: false,
  });
  // Gate open, fan the last load on: turning it off closes the gate too.
  const running = dev('HCF002S_POWERON_OFF_1', { poweron: true, fanon: true });
  assert.equal(featureValues(running).power.state, 1);
  assert.deepEqual(buildCommand(running, 'power', 1, DEFAULT), { fanon: true });
  assert.deepEqual(buildCommand(running, 'power', 0, DEFAULT), { fanon: false, poweron: false });
  // The light is on: the gate stays open.
  const lit = dev('HCF002S_POWERON_OFF_1', { poweron: true, fanon: true, lighton: true });
  assert.deepEqual(buildCommand(lit, 'power', 0, DEFAULT), { fanon: false });
});

test('ceiling fan light: features only for the keys the device reports', () => {
  const gated = dev('HCF002S_POWERON_OFF_1');
  assert.deepEqual(gated.caps.light, { brightness: true, colorTemperature: true });
  assert.deepEqual(gated.caps.ambient, { brightness: [1, 5], color: true, colorFeedback: true });
  const values = featureValues(dev('HCF002S_POWERON_OFF_1', { poweron: true, lighton: true }));
  assert.deepEqual(values.light, { state: 1 });
  assert.deepEqual(values['light-brightness'], { state: 24 });
  // 60 % of 2700-6500 K.
  assert.deepEqual(values['light-temperature'], { state: 4980 });
  assert.deepEqual(values['ambient-light'], { state: 0 });
  assert.deepEqual(values['ambient-brightness'], { state: 3 });
  assert.deepEqual(values['ambient-color'], { state: 65280 });
  // Gate closed: the retained light is off.
  assert.deepEqual(featureValues(dev('HCF002S_POWERON_OFF_1', { lighton: true })).light, {
    state: 0,
  });
  // DR-HCF001S: a light, no ambient light, no gate.
  const plain = dev('HCF001S_1');
  assert.deepEqual(plain.caps.light, { brightness: true, colorTemperature: true });
  assert.equal(plain.caps.ambient, undefined);
  assert.deepEqual(featureValues(plain).light, { state: 0 });
  assert.deepEqual(buildCommand(plain, 'light', 1, DEFAULT), { lighton: true });
  // Other fans have no light.
  assert.equal(dev('HTF017S_1').caps.light, undefined);
  assert.throws(() => buildCommand(dev('HTF017S_1'), 'light', 1, DEFAULT));
  // A ceiling fan that does not report lighton has no light feature.
  const bare = dev('HCF002S_POWERON_OFF_1', { lighton: undefined, atmon: undefined });
  assert.equal(bare.caps.light, undefined);
  assert.equal(bare.caps.ambient, undefined);
});

test('ceiling fan light commands respect the power gate', () => {
  // Gate closed: waking the light alone keeps the fan and the ambient light off.
  const closed = dev('HCF002S_POWERON_OFF_1');
  assert.deepEqual(buildCommand(closed, 'light', 1, DEFAULT), {
    poweron: true,
    lighton: true,
    fanon: false,
    atmon: false,
  });
  assert.deepEqual(buildCommand(closed, 'ambient-light', 1, DEFAULT), {
    poweron: true,
    atmon: true,
    fanon: false,
    lighton: false,
  });
  // Gate open, light the last load on: off closes the gate.
  const lit = dev('HCF002S_POWERON_OFF_1', { poweron: true, fanon: false, lighton: true });
  assert.deepEqual(buildCommand(lit, 'light', 1, DEFAULT), { lighton: true });
  assert.deepEqual(buildCommand(lit, 'light', 0, DEFAULT), { lighton: false, poweron: false });
  // The fan still runs: the gate stays open.
  const both = dev('HCF002S_POWERON_OFF_1', { poweron: true, fanon: true, lighton: true });
  assert.deepEqual(buildCommand(both, 'light', 0, DEFAULT), { lighton: false });
  // Settings never touch the gate.
  assert.deepEqual(buildCommand(closed, 'light-brightness', 80, DEFAULT), { brightness: 80 });
  assert.throws(() => buildCommand(closed, 'light-brightness', 0, DEFAULT));
  assert.deepEqual(buildCommand(closed, 'light-temperature', 2700, DEFAULT), { colortemp: 0 });
  assert.deepEqual(buildCommand(closed, 'light-temperature', 6500, DEFAULT), { colortemp: 100 });
  assert.deepEqual(buildCommand(closed, 'light-temperature', 9000, DEFAULT), { colortemp: 100 });
  assert.deepEqual(buildCommand(closed, 'ambient-brightness', 5, DEFAULT), { atmbri: 5 });
  assert.throws(() => buildCommand(closed, 'ambient-brightness', 6, DEFAULT));
  assert.deepEqual(buildCommand(closed, 'ambient-color', 0xff0000, DEFAULT), {
    atmcolor: 0xff0000,
  });
});

test('ambient brightness 1-100 on the newer ceiling fans (pydreo)', () => {
  const entry = { model: 'DR-HCF008S' };
  const state = { poweron: true, fanon: true, atmon: true, atmbri: 70 };
  const caps = capabilities(modelProfile(entry, state), state);
  assert.deepEqual(caps.ambient, { brightness: [1, 100], color: false, colorFeedback: false });
  // DR-HCF007S: a colour the device takes without reporting it.
  const caps7 = capabilities(modelProfile({ model: 'DR-HCF007S' }, state), state);
  assert.deepEqual(caps7.ambient, { brightness: [1, 100], color: true, colorFeedback: false });
  // The RGBIC revision of the DR-HCF002S: 1-100, no direct colour.
  const rgbic = { ...state, atmbri: 50, rgbeffectid: '2070476690030592000' };
  const caps2 = capabilities(modelProfile({ model: 'DR-HCF002S' }, rgbic), rgbic);
  assert.deepEqual(caps2.ambient, { brightness: [1, 100], color: false, colorFeedback: false });
});

test('ceiling fan without a gate: fanon alone', () => {
  const fan = dev('HCF001S_1');
  assert.equal(fan.caps.power.key, 'fanon');
  assert.deepEqual(buildCommand(fan, 'mode', 'reverse', DEFAULT), { mode: 4 });
});

test('heater: setpoint in °C, mode, heat level, child lock read-only', () => {
  const heater = dev('HSH004S_1');
  assert.deepEqual(heater.caps.targetTemperature.range, [5, 35]);
  assert.deepEqual(featureValues(heater), {
    power: { state: 1 },
    mode: { text: 'hotair' },
    'heat-level': { text: '3' },
    'target-temperature': { state: 26 },
    temperature: { state: 17.8 },
    'child-lock': { state: 0 },
  });
  assert.deepEqual(buildCommand(heater, 'target-temperature', 21, DEFAULT), { ecolevel: 70 });
  // Clamped to the bounds of the model, in °F.
  assert.deepEqual(buildCommand(heater, 'target-temperature', 40, DEFAULT), { ecolevel: 95 });
  assert.deepEqual(buildCommand(heater, 'mode', 'eco', DEFAULT), { mode: 'eco' });
  assert.deepEqual(buildCommand(heater, 'heat-level', '2', DEFAULT), { htalevel: 2 });
  assert.throws(() => buildCommand(heater, 'child-lock', 1, DEFAULT), /not valid/);
});

test('heater safety: turning on is refused unless the user allowed it, off always works', () => {
  const heater = dev('HSH004S_1', { poweron: false });
  assert.throws(
    () => buildCommand(heater, 'power', 1, DEFAULT),
    (err) => err.key === 'heaterPowerOnRefused',
  );
  assert.deepEqual(buildCommand(heater, 'power', 1, ALLOWED), { poweron: true });
  assert.deepEqual(buildCommand(dev('HSH004S_1'), 'power', 0, DEFAULT), { poweron: false });
  // An off heater keeps its mode and level until it is turned on by hand.
  assert.throws(
    () => buildCommand(heater, 'mode', 'hotair', DEFAULT),
    (err) => err.key === 'heaterOff',
  );
  assert.throws(
    () => buildCommand(heater, 'heat-level', '1', DEFAULT),
    (err) => err.key === 'heaterOff',
  );
  // The setpoint never turns it on: allowed.
  assert.deepEqual(buildCommand(heater, 'target-temperature', 19, DEFAULT), { ecolevel: 66 });
});

test('tower fan & heater combo (DR-HSH016S): the mode is a function number', () => {
  const combo = dev('HSH016S_1');
  assert.equal(combo.caps.heaterCombo, true);
  assert.deepEqual(combo.caps.heatLevel.range, [1, 5]);
  assert.equal(featureValues(combo).mode.text, 'coolair'); // mode 2: the fan function
  assert.deepEqual(buildCommand(combo, 'mode', 'eco', DEFAULT), { mode: 1, htamode: 2 });
  assert.deepEqual(buildCommand(combo, 'mode', 'hotair', DEFAULT), { mode: 1, htamode: 1 });
  assert.deepEqual(buildCommand(combo, 'mode', 'coolair', DEFAULT), { mode: 2 });
});

test('purifier: "auto-regular" reads as auto, and the variant is sent back', () => {
  const purifier = dev('HAP003S_4');
  assert.deepEqual(purifier.caps.speed.range, [1, 18]);
  assert.equal(featureValues(purifier).mode.text, 'auto');
  assert.equal(featureValues(purifier).pm25.state, 3);
  assert.deepEqual(buildCommand(purifier, 'mode', 'auto', DEFAULT), { mode: 'auto-regular' });
  assert.deepEqual(buildCommand(purifier, 'mode', 'sleep', DEFAULT), { mode: 'sleep' });
});

test('purifier: models that refuse plain "auto" get their variant from the table', () => {
  const purifier = dev('HAP007S_1');
  assert.deepEqual(buildCommand(purifier, 'mode', 'auto', DEFAULT), { mode: 'auto-regular' });
  assert.equal(featureValues(purifier)['filter-life'].state, 89);
});

test('purifier: the filter life is published only where it is a percentage', () => {
  // DR-HAP002S reports "lifetime" in hours (pydreo): no filter feature.
  assert.equal(dev('HAP002S_1').caps.filterLife, undefined);
});

test('humidifier: humidity, target of the current mode, mist level, water tank', () => {
  const humidifier = dev('HHM001S_1');
  assert.deepEqual(featureValues(humidifier), {
    power: { state: 1 },
    mode: { text: 'auto' },
    'target-humidity': { state: 60 },
    'mist-level': { state: 6 },
    humidity: { state: 47 },
    'water-tank': { state: 1 }, // LIQUID_STATE.NORMAL
  });
  assert.deepEqual(buildCommand(humidifier, 'target-humidity', 55, DEFAULT), { rhautolevel: 55 });
  // In sleep mode, the target is the sleep one.
  const asleep = dev('HHM001S_1', { mode: 2 });
  assert.equal(featureValues(asleep)['target-humidity'].state, 70);
  assert.deepEqual(buildCommand(asleep, 'target-humidity', 65, DEFAULT), { rhsleeplevel: 65 });
  // An empty tank reads LOW.
  assert.equal(featureValues(dev('HHM001S_1', { wrong: 1 }))['water-tank'].state, 0);
  assert.deepEqual(buildCommand(humidifier, 'mist-level', 2, DEFAULT), { foglevel: 2 });
  assert.deepEqual(buildCommand(humidifier, 'mode', 'normal', DEFAULT), { mode: 0 });
});

test('humidifier with a water gauge: water level in percent', () => {
  const humidifier = dev('HHM014S_2');
  assert.equal(featureValues(humidifier)['water-level'].state, 42);
  assert.equal(humidifier.caps.waterTank, undefined);
});

test('dehumidifier (DR-HDH002S): power, fan 1-3, modes, humidity, target, display, alarms', () => {
  const dehumidifier = dev('HDH002S');
  assert.equal(dehumidifier.profile.kind, 'dehumidifier');
  assert.deepEqual(featureValues(dehumidifier), {
    power: { state: 0 },
    speed: { state: 2 },
    mode: { text: 'auto' },
    'target-humidity': { state: 50 },
    temperature: { state: 19.4 }, // 67 °F
    humidity: { state: 66 },
    display: { state: 1 },
    'tank-full': { state: 0 },
    'filter-clean': { state: 0 },
    'child-lock': { state: 0 },
  });
  assert.deepEqual(dehumidifier.caps.speed.range, [1, 3]);
  assert.deepEqual(dehumidifier.caps.targetHumidity.range, [30, 85]);
  assert.deepEqual(buildCommand(dehumidifier, 'power', 1, DEFAULT), { poweron: true });
  assert.deepEqual(buildCommand(dehumidifier, 'speed', 3, DEFAULT), { windlevel: 3 });
  assert.throws(() => buildCommand(dehumidifier, 'speed', 4, DEFAULT), /not valid/);
  assert.deepEqual(buildCommand(dehumidifier, 'mode', 'continuous', DEFAULT), { mode: 2 });
  assert.deepEqual(buildCommand(dehumidifier, 'target-humidity', 45, DEFAULT), {
    rhautolevel: 45,
  });
  assert.throws(() => buildCommand(dehumidifier, 'target-humidity', 90, DEFAULT), /not valid/);
  assert.deepEqual(buildCommand(dehumidifier, 'display', 0, DEFAULT), { lighton: false });
  // Alarms are read-only.
  assert.throws(() => buildCommand(dehumidifier, 'tank-full', 0, DEFAULT), /not valid/);
  assert.throws(() => buildCommand(dehumidifier, 'filter-clean', 0, DEFAULT), /not valid/);
});

test('dehumidifier alarms: any tank code is full, the filter past its threshold', () => {
  assert.equal(featureValues(dev('HDH002S', { wrong: 1 }))['tank-full'].state, 1);
  assert.equal(featureValues(dev('HDH002S', { wrong: 3 }))['tank-full'].state, 1);
  const filter = (worktime, filterthr) =>
    featureValues(dev('HDH002S', { worktime, filterthr }))['filter-clean']?.state;
  assert.equal(filter(599, 600), 0);
  assert.equal(filter(600, 600), 1);
  assert.equal(filter(10, 0), undefined, 'no threshold, no value');
  // A mode value nobody has reported yet shows no mode rather than a wrong one.
  assert.equal(featureValues(dev('HDH002S', { mode: 3 })).mode, undefined);
});

test('a dehumidifier without the alarm keys has no alarm feature', () => {
  const bare = dev('HDH002S');
  for (const key of ['wrong', 'worktime', 'filterthr', 'lighton', 'rhautolevel']) {
    delete bare.state[key];
  }
  const caps = capabilities(bare.profile, bare.state);
  assert.equal(caps.tankFull, undefined);
  assert.equal(caps.filterClean, undefined);
  assert.equal(caps.display, undefined);
  assert.equal(caps.targetHumidity, undefined);
});

test('a value the device did not report is not published', () => {
  const fan = dev('HTF017S_1');
  delete fan.state.temperature;
  delete fan.state.windlevel;
  const values = featureValues(fan);
  assert.equal(values.temperature, undefined);
  assert.equal(values.speed, undefined);
});
