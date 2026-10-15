# Dreo

Control your **Dreo** fans, heaters, air purifiers and humidifiers from Gladys, through the Dreo cloud — the
same service the Dreo app uses. States arrive in real time: a speed changed on the remote or in the app shows up
in Gladys within a second.

> This integration was **developed without the hardware**: it relies on the real Dreo cloud answers published
> by the Home Assistant `hass-dreo` project. Feedback welcome, on the Gladys forum or in a GitHub issue. It is
> **not affiliated with Dreo**.

## Overview

| Dreo device                                     | What you get in Gladys                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tower fans (DR-HTF…)                            | on/off, speed, mode, oscillation, room temperature                                                              |
| Air circulators / floor fans (DR-HAF…, DR-HPF…) | on/off, speed, mode, oscillation (horizontal and vertical), room temperature                                    |
| Ceiling fans (DR-HCF…)                          | fan on/off, speed, mode (including reverse)                                                                     |
| Heaters (DR-HSH…, WH…)                          | on/off (see the safety section), target temperature, mode, heat level, room temperature, child lock (read-only) |
| Air purifiers (DR-HAP…)                         | on/off, speed, mode, PM2.5, filter life (where reported in %)                                                   |
| Humidifiers (DR-HHM…)                           | on/off, mode, target humidity, mist level, humidity, water tank or water level                                  |

Other Dreo products (air conditioners, dehumidifiers, misting fans, cookers) are listed by the "Refresh the
devices" button as "not supported yet".

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Dreo account, with the devices set up in the Dreo app (Wi-Fi, room…).
- Internet access for Gladys: everything goes through the Dreo cloud.

## Configuration

1. In Gladys, **Integrations → Install from GitHub**, then enter `https://github.com/guim31/gladys-dreo`.
2. In the configuration screen, enter the **e-mail address** and the **password** of your Dreo account.
3. **Account region**: Europe or North America. If you get it wrong, the integration switches by itself.
4. **Language of the feature names**: the names given to the features when you add a device (French by default).
5. **Allow turning heaters on from Gladys**: off by default, see below.
6. Open the **Discovery** tab and add the devices you want.

The password is only used to log in; the integration keeps the session token in its private `/data` volume and
logs in again only when Dreo asks for it.

## Devices

The power is a regular on/off switch. The **mode** is a list of the modes your model actually has (normal,
natural, sleep, auto, turbo…). Speeds go from 1 to the maximum of your model. Temperatures are converted to
degrees Celsius.

### Fans

**Oscillation** uses the Gladys fan oscillation setting: _off_ or _left-right_ on tower fans, plus _up-down_ and
_both_ on air circulators that tilt. On ceiling fans with a light, turning the fan on never turns the light on.

### Heaters

For your safety, **a heater cannot be turned on from Gladys** unless you enable "Allow turning heaters on from
Gladys": nobody may be in the room to watch it. Turning it **off**, changing the **target temperature** and
watching it always work. While a heater is off and the option is disabled, its mode and heat level cannot be
changed either (some models may start when they receive a mode). The **child lock** is shown, never driven. Dreo
heaters obey the target temperature in **Eco** mode; in **Heat** mode they follow the heat level (H1, H2…).

### Air purifiers

PM2.5 is in µg/m³. Purifiers that need a special "auto" command (`auto-regular`, `auto-silent`) get it
automatically. The filter life is shown on the models that report it in percent.

### Humidifiers

The target humidity (30 to 90 %) is the one of the current mode (auto or sleep). The water tank shows _Low_ when
it is empty; models with a water gauge show the level in percent instead.

## Widget

The **Dreo devices** widget shows every Dreo device added to Gladys on one card — on, off or offline, with its
mode, speed and temperature — and a **Turn all off** button (with a confirmation). Add it from the dashboard
editor.

## Scene trigger

**Dreo device online or offline**: a device lost its connection to the Dreo cloud (unplugged, Wi-Fi down), or got
it back. Choose a device and/or the change, or leave them empty. Variables: the device name and the new state
(`online` or `offline`).

## Scene action

**Turn off Dreo devices**: turns off every Dreo device added to Gladys that is on, or only the chosen kinds
(fans, heaters, air purifiers, humidifiers). Output: the number of devices turned off.

## Scene examples

- **Leaving home**: when the last person leaves, run _Turn off Dreo devices_ with the kind _Heaters_, then send
  yourself a message with the number of devices turned off.
- **Too hot in the bedroom**: when the bedroom temperature goes over 26 °C after 10 pm, turn the tower fan on in
  _Sleep_ mode at speed 2.
- **Heater unplugged**: when the living-room heater goes offline, send a notification.
- **Dry air**: when the humidity of the humidifier drops below 35 %, set its target humidity to 50 %.

## How states are kept up to date

The integration keeps a WebSocket open with the Dreo cloud, like the app: changes arrive at once. Every 10 minutes
it also re-reads the state of the devices added to Gladys, in case an event was missed, and sends an unchanged
value again every 6 hours so Gladys never shows "no recent value". Dreo publishes no quota for this API: the
integration stays well below what the app does (one login, then one request per device every 10 minutes), and
only sends Gladys the values that changed.

## Troubleshooting

- **"Dreo refused the e-mail address or the password"**: check them in the Dreo app; the integration does not
  retry on its own, to avoid locking your account. Save the configuration again to retry.
- **"The Dreo cloud cannot be reached"**: check the Internet access of Gladys; the integration retries every
  minute, then less and less often.
- **A command fails with "did not confirm"**: the device may be offline or busy; check it in the Dreo app.
- **A heater does not respond**: Dreo heaters disable remote control after 24 hours without use (a safety rule);
  press the Wi-Fi button on the heater.
- **A device is missing**: press "Refresh the devices" in the configuration screen, then look at the Discovery
  tab.
- For details, set the `LOG_LEVEL=debug` environment variable and read the integration logs: they never contain
  your password nor your token.

## Limitations

- Developed without the hardware: the models are those of `hass-dreo`, the bounds of a model missing from its
  tables are guesses.
- Cloud only: no local control, no control while the Internet is down.
- The lights of ceiling fans, ambient lights, timers, display and sound settings are not exposed.
- Air conditioners, dehumidifiers, misting fans and cookers are not supported yet.
- Dreo reports temperatures in °F: the conversion rounds to 0.1 °C, and the target temperature to the degree.
- The Dreo cloud API is not public: Dreo may change it without notice.
