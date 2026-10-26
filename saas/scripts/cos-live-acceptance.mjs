#!/usr/bin/env node
// Run only against an explicitly chosen HTTPS deployment with a separately
// provisioned non-production test account. Credentials never enter the repo.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const target = process.env.COS_LIVE_BASE_URL
const state = process.env.COS_LIVE_STORAGE_STATE
if (!target || !state || !existsSync(state)) {
  console.error('COS live acceptance NOT RUN: set COS_LIVE_BASE_URL and COS_LIVE_STORAGE_STATE (existing authenticated Playwright state file).')
  process.exit(2)
}
let url
try { url = new URL(target) } catch { console.error('Invalid COS_LIVE_BASE_URL'); process.exit(2) }
if (url.protocol !== 'https:' || url.username || url.password || !/^(?:[a-z0-9-]+\.)*(?:itmounts\.com|signalboostapp\.com|vercel\.app)$/i.test(url.hostname)) {
  console.error('COS live acceptance NOT RUN: target must be an HTTPS iTMounts deployment with no embedded credentials.')
  process.exit(2)
}
if (!process.env.COS_LIVE_EXPECTED_COMMIT) {
  console.error('COS live acceptance NOT RUN: set COS_LIVE_EXPECTED_COMMIT for deployment correlation.')
  process.exit(2)
}
const result = spawnSync('npx', ['--no-install','playwright','test','--config=playwright.live.config.ts'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})
process.exit(result.status === null ? 1 : result.status)
