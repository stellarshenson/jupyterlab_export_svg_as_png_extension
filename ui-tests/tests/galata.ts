import { test as base } from '@jupyterlab/galata';

export { expect } from '@jupyterlab/galata';

/**
 * Galata waits for JupyterLab to become ready through `waitForCondition`, whose
 * timeout defaults to 15s and is not passed through. A machine carrying a full
 * set of lab extensions sits right on that edge, which turns every test into a
 * coin flip. The fixture is not an option, so it cannot be set from the config's
 * `use` block - `extend` is the way in. Same two conditions, longer patience.
 */
const READY_TIMEOUT = 60 * 1000;

export const test = base.extend({
  waitForApplication: async ({}, use) => {
    await use(async (page, helpers) => {
      await page
        .locator('#jupyterlab-splash')
        .waitFor({ state: 'detached', timeout: READY_TIMEOUT });
      await helpers.waitForCondition(
        () => helpers.activity.isTabActive('Launcher'),
        READY_TIMEOUT
      );
      // Oddly current tab is not always set to active
      if (!(await helpers.isInSimpleMode())) {
        await helpers.activity.activateTab('Launcher');
      }
    });
  }
});
