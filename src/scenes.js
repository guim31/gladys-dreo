// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`), registered by src/app.js.
// Keys are forever once published.
// -----------------------------------------------------------------------------

export const GROUPS = ['fans', 'heaters', 'purifiers', 'humidifiers'];

export const SCENE_ACTIONS = {
  /**
   * Turns off every Dreo device added to Gladys that is on, optionally of some
   * kinds only ("leaving home: heaters off"). Output: how many were turned off.
   */
  turn_off_all: async (hub, { fields = {} }) => {
    const kinds = Array.isArray(fields.kinds)
      ? fields.kinds.filter((kind) => GROUPS.includes(kind))
      : [];
    const count = await hub.turnAllOff(kinds.length > 0 ? kinds : null);
    return { count };
  },
};
