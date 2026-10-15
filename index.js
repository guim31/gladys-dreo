// -----------------------------------------------------------------------------
// Entry point: wires the Gladys SDK to the Dreo hub (src/app.js). No device
// logic here. Handlers are registered before connect().
//
// Environment provided by the Gladys supervisor: GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR (read by the SDK).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerHandlers(gladys);

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal}, stopping`);
  app.stop(); // closes the Dreo WebSocket and the timers
});

logger.info('Starting the Dreo integration...');
gladys.connect().catch((err) => {
  logger.error(`Initial connection failed (${err.message})`);
  process.exit(1);
});
