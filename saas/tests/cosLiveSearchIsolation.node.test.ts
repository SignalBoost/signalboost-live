import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// The COS entrypoint must not let one failing discovery provider discard
// successful searches from other query variations or crash the request.
test('live searches isolate per-query transport failures', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(route, /queries\.map\(async query=>\{try\{return await getExternalInfo/)
  assert.match(route, /catch\(error\)\{const message=error instanceof Error/)
  assert.match(route, /return \{ok:false as const,error:'Live search provider failed for this query\.',results:\[\]\}/)
  assert.match(route, /liveResults\.filter\(live=>live\.ok\)/)
})
