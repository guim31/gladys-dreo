# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/guim31/gladys-dreo/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-dreo/releases/tag/v1.0.1
