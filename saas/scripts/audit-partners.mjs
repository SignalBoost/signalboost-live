import fs from 'node:fs/promises'

const partners = JSON.parse(await fs.readFile(new URL('../data/partners.json', import.meta.url), 'utf8')).slice(0, 125)
const checkedAt = new Date().toISOString()

async function check(partner) {
  const target = partner.affiliate?.default || partner.url
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const response = await fetch(target, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    clearTimeout(timeout)
    return { id: partner.id, name: partner.name, url: target, ok: response.ok, status: response.status }
  } catch (error) {
    return { id: partner.id, name: partner.name, url: target, ok: false, status: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

const results = []
for (let index = 0; index < partners.length; index += 25) {
  results.push(...await Promise.all(partners.slice(index, index + 25).map(check)))
}
const failures = results.filter(result => !result.ok)
await fs.mkdir(new URL('../logs/', import.meta.url), { recursive: true })
await fs.writeFile(new URL('../logs/affiliate-audit.json', import.meta.url), JSON.stringify({ checkedAt, total: results.length, failures: failures.length, results }, null, 2))
console.log(`Checked ${results.length} partner URLs; failures logged: ${failures.length}`)
process.exit(failures.length ? 2 : 0)
