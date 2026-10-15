// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`) and normalization, so the rest of the code never
// deals with `undefined` or with values typed as strings by a form.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const REGIONS = ['eu', 'us'];

export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  // Where the Dreo account was created. The login answer names the real one:
  // the integration follows it (see src/dreo/api.js), this is only the first try.
  region: 'eu',
  // Language of the feature names and of the texts the container produces
  // (Gladys does not tell a device integration the user's language).
  language: 'fr',
  // Turning a space heater ON from Gladys is refused unless the user opts in:
  // nobody may be in the room. Turning it off always works.
  heater_remote_power_on: false,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language).toLowerCase();
  const region = String(raw.region ?? DEFAULT_CONFIG.region).toLowerCase();
  return {
    email: String(raw.email ?? '').trim(),
    password: String(raw.password ?? ''),
    region: REGIONS.includes(region) ? region : DEFAULT_CONFIG.region,
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    heater_remote_power_on:
      raw.heater_remote_power_on === true || raw.heater_remote_power_on === 'true',
  };
}

/** The integration can only reach the Dreo cloud once both are set. */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}
