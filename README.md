# Dreo for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for **Dreo** fans, space heaters, air purifiers and
humidifiers, through the Dreo cloud — the REST API and WebSocket the Dreo app uses. States arrive in real time.

> **Developed without the hardware: feedback welcome.** The integration relies on the real Dreo cloud answers
> published by the Home Assistant [`hass-dreo`](https://github.com/JeffSteinbok/hass-dreo) project; it has not run
> against a real device yet. Please report what works and what does not on the Gladys forum or in an issue.

## Features

| Dreo device                                    | Features in Gladys                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tower fans (DR-HTF…)                           | on/off, speed (bounds of the model), mode, oscillation, room temperature                                 |
| Air circulators, floor fans (DR-HAF…, DR-HPF…) | on/off, speed, mode, horizontal/vertical oscillation, room temperature                                   |
| Ceiling fans (DR-HCF…)                         | fan on/off, speed, mode (including reverse)                                                              |
| Space heaters (DR-HSH…, WH…)                   | off (on only if allowed), target temperature, mode, heat level, room temperature, child lock (read-only) |
| Air purifiers (DR-HAP…)                        | on/off, speed, mode, PM2.5, filter life (where reported in %)                                            |
| Humidifiers (DR-HHM…)                          | on/off, mode, target humidity, mist level, humidity, water tank or water level                           |

- **Real time**: device reports arrive over the Dreo WebSocket, with reconnection.
- **Transport badge** per device (`cloud` / `unreachable`), and a **scene trigger** when a device goes offline or
  comes back.
- **Scene action** "Turn off Dreo devices", optionally by kind (fans, heaters, purifiers, humidifiers).
- **Dashboard widget**: every Dreo device on one card, and a "Turn all off" button.
- **Heater safety**: turning a heater on from Gladys is refused unless the user enables it in the configuration;
  turning it off always works. Nothing is exposed as a switch that could start a heater by default.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Dreo account with the devices set up in the Dreo app, and Internet access.

## Installation

1. In Gladys: **Integrations → Install from GitHub**, enter `https://github.com/guim31/gladys-dreo`.
2. In the configuration screen: the e-mail address and password of the Dreo account, the region (Europe or North
   America, corrected automatically), the language of the feature names.
3. Add the devices from the **Discovery** tab.

The user documentation is in [`docs/`](docs/en.md) (English, French, German, Spanish).

## How it works

- **Login**: `POST /api/oauth/login` on `app-api-eu|us.dreo-tech.com` with the MD5 of the password, as the app does;
  the access token and the region are kept in `/data/dreo-session.json` (mode 600), bound to a hash of the e-mail
  address, so a restart does not log in again. A refused login is not retried in a loop (account lockout).
- **Devices**: the device list and one state request per device at start and on each search. The kind comes from
  the model prefix, the speed bounds and modes from the device list (`controlsConf`) or from a model table ported
  from `hass-dreo`.
- **States**: the WebSocket `wss://wsb-eu|us.dreo-tech.com/websocket` pushes `report`, `control-report`,
  `device-online` and `device-offline` messages. Every 10 minutes the container re-reads the states of the devices
  added to Gladys (Gladys does not poll external devices reliably, GladysAssistant/Gladys#3198); only changed values
  are sent to Gladys, with a heartbeat every 6 hours.
- **Commands**: `{ devicesn, method: "control", params }` over the WebSocket, one at a time, acknowledged by the
  cloud's `control-reply`/`control-report` within 4 seconds.

## Limitations

- Developed without the hardware (see above); models missing from the `hass-dreo` tables get default bounds.
- Cloud only; the Dreo cloud API is not public and may change. Dreo publishes no quota: the integration stays far
  below the app's own traffic.
- Not supported yet: air conditioners, dehumidifiers, misting fans, cookers; ceiling fan lights, ambient lights,
  timers, display and sound settings.
- Dreo reports temperatures in °F; Gladys gets °C rounded to 0.1 (setpoints to the degree).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
DREO_EMAIL=… DREO_PASSWORD=… node scripts/probe.mjs   # read-only probe of the real cloud
node scripts/probe.mjs                                 # fake account: shows how Dreo refuses it
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            every SDK handler -> the hub, the "Refresh the devices" report
src/hub.js            login, discovery, WebSocket, refresh timer, commands, triggers
src/devices.js        Dreo device -> Gladys features, values and commands (heater safety)
src/dreo/api.js       REST client of the Dreo cloud (login, devices, state)
src/dreo/socket.js    WebSocket link: keepalive, reconnection, silence watchdog
src/dreo/models.js    kinds, speed bounds and modes per model
src/widgets.js        "Dreo devices" dashboard widget
src/scenes.js         "Turn off Dreo devices" scene action
test/                 node --test on the SDK's fake Gladys and a fake Dreo cloud
test/fixtures/dreo/   real cloud answers from hass-dreo's test suite, anonymized
```

`test/gladys-rules.test.js` checks every discovered device against the category/type table extracted from the
Gladys core. Releases are made by the **Release** workflow (Actions → Release); never edit the versions by hand.
See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [`hass-dreo`](https://github.com/JeffSteinbok/hass-dreo) by Jeff Steinbok, Andy Cooper and contributors (MIT):
  the protocol (pydreo), the model table, the device behaviours (ceiling fan power gate, purifier "auto" variants,
  heater combos) and the API answers used as test fixtures in `test/fixtures/dreo/` (anonymized). MIT notice:
  "Copyright (c) 2023 Jeff Steinbok, Andy Cooper".
- [`dreo-team/hscloud`](https://github.com/dreo-team/hscloud) (MIT), the official Dreo library behind the Home
  Assistant core integration, read for the cloud endpoints and regions.

## Disclaimer

This project is **not affiliated with, endorsed or sponsored by Dreo**. "Dreo" is a trademark of its owner.

## License

Apache-2.0 (see [`LICENSE`](LICENSE)).
