import { chromium } from '@playwright/test'
import { DefaultBrowserSessionFactory } from './session-factory.ts'
import { createPlaywrightBrowserEngineLauncher } from './playwright-launcher.ts'

export const browserSessionFactory = new DefaultBrowserSessionFactory({
  launcher: createPlaywrightBrowserEngineLauncher(chromium),
  headless: true,
  launchTimeoutMs: 30_000,
  actionTimeoutMs: 15_000,
  launchArgs: [
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  viewport: {
    width: 1440,
    height: 900,
  },
})
