import { defineConfig } from '@playwright/test'

// Deliberately separate from mocked UI suites. The launcher enforces an
// authenticated, HTTPS production/preview target and an existing storage state.
const baseURL = process.env.COS_LIVE_BASE_URL
const storageState = process.env.COS_LIVE_STORAGE_STATE
if (!baseURL || !storageState) {
  throw new Error('COS live acceptance requires COS_LIVE_BASE_URL and COS_LIVE_STORAGE_STATE')
}

export default defineConfig({
  testDir: './live-acceptance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['line']],
  use: {
    baseURL,
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
