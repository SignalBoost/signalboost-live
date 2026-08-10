import fs from 'node:fs/promises'
import path from 'node:path'
import existing from '../data/prospects.json'
import { mergeCuratedSnapshot, selectEnterpriseMemoryPromotionCandidates } from '../lib/prospect-intelligence/promotion'

async function main() {
  const candidates = await selectEnterpriseMemoryPromotionCandidates({ limit: 5000 })
  const merged = mergeCuratedSnapshot(
    Array.isArray(existing.prospects) ? existing.prospects : [],
    candidates,
  )

  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    prospects: merged,
  }

  const target = path.resolve(process.cwd(), 'data/prospects.json')
  await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`[prospects] curated=${merged.length} promoted=${candidates.length} target=${target}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
