import { writeFileSync, mkdirSync } from 'node:fs'
import { partners } from '../lib/marketplace/partners.ts'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const urls = []
for (const partner of partners) {
  urls.push({ partner: partner.id, region: 'default', url: partner.url })
  for (const [region, url] of Object.entries(partner.regional_urls)) urls.push({ partner: partner.id, region, url })
}

const results = []
for (const item of urls) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300)
    const res = await fetch(item.url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    clearTimeout(timeout)
    results.push({ ...item, ok: res.ok || (res.status >= 300 && res.status < 400), status: res.status })
  } catch (error) {
    results.push({ ...item, ok: false, error: error instanceof Error ? error.message : 'unknown error' })
  }
  await sleep(100)
}
mkdirSync('reports', { recursive: true })
writeFileSync('reports/affiliate-link-audit.json', `${JSON.stringify({ checked_at: new Date().toISOString(), count: results.length, failures: results.filter((r) => !r.ok), results }, null, 2)}\n`)
const failures = results.filter((r) => !r.ok).length
console.log(`Checked ${results.length} partner URLs with ${failures} failures.`)
if (failures) console.log('Failures logged to reports/affiliate-link-audit.json without deleting partners.')
