# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Fixed

- Dehumidifiers: the Custom mode ("Perso" in the Dreo app, value 3) is now shown and can be selected.

## [1.2.0] - 2026-11-25

### Added

- Dreo dehumidifiers (DR-HDH…, such as the DR-HDH002S): on/off, fan speed (low,
  medium, high), mode (auto, continuous), target humidity (30-85 %), humidity,
  room temperature, display on/off, child lock (read-only), and two alarms:
  "Water tank full" and "Filter to clean". A new scene trigger, "Dreo
  dehumidifier tank full", fires when the tank alarm stops the device. The
  "Turn off Dreo devices" scene action can target dehumidifiers.
- A mode value the integration does not know is logged once, so its owner can
  report it.

## [1.1.0] - 2026-11-22

### Added

- Ceiling fan lights, on the fan device when the model reports them: the light
  (on/off, brightness, colour temperature in kelvin) and the ambient light
  (on/off, brightness, colour). Each one switches without waking the fan or the
  other light. Already added fans get them with "Update" in the Discovery tab.

## [1.0.1] - 2026-10-15

### Added

- Dreo tower fans, air circulators and ceiling fans: on/off, speed within the
  bounds of the model, mode, oscillation, room temperature.
- Dreo space heaters: off, target temperature (°C), mode, heat level, room
  temperature, child lock (read-only). Turning a heater on from Gladys is
  refused unless the new "Allow turning heaters on from Gladys" option is
  enabled.
- Dreo air purifiers (on/off, speed, mode, PM2.5, filter life) and humidifiers
  (on/off, mode, target humidity, mist level, humidity, water tank or level).
- Real-time states through the Dreo WebSocket, a refresh every 10 minutes by
  the integration itself, and a heartbeat every 6 hours.
- A per-device `cloud` / `unreachable` badge and the "Dreo device online or
  offline" scene trigger.
- The "Turn off Dreo devices" scene action and the "Dreo devices" dashboard
  widget with a "Turn all off" button.
- "Refresh the devices" button listing the devices of the account, supported
  or not.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-dreo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/guim31/gladys-dreo/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/guim31/gladys-dreo/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/guim31/gladys-dreo/releases/tag/v1.0.1
