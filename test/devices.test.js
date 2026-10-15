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
  assert.equal(kindOfModel('DR-HDH002S'), null);
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

test('a value the device did not report is not published', () => {
  const fan = dev('HTF017S_1');
  delete fan.state.temperature;
  delete fan.state.windlevel;
  const values = featureValues(fan);
  assert.equal(values.temperature, undefined);
  assert.equal(values.speed, undefined);
});
