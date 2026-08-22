/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

// `configure_jupyter_server` pins the port and sets port_retries = 0, so the test
// server dies rather than move when the port is taken. Thread one knob through
// both ends and never adopt a server this suite did not start.
const PORT = process.env.JUPYTER_TEST_PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;

module.exports = {
  ...baseConfig,
  // uploading fixtures and opening them through the file browser costs ~30s on
  // top of app startup
  timeout: 180 * 1000,
  // every spec drives the same server: parallel workers race on the workspace
  // and the file browser, which surfaces as intermittent readiness timeouts
  workers: 1,
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL,
    // the base config sets trace: 'on-first-retry', but retries default to 0,
    // so without this a CI failure ships video and no trace
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'jlpm start',
    url: `${BASE_URL}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: false
  }
};
