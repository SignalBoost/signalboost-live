import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Cybersecurity dependency scans stream real server progress', () => {
  const scanner = read('../lib/cyber/dependencyScanner.ts')
  const route = read('../app/api/hub/cyber/dependencies/route.ts')
  const page = read('../app/dashboard/cybersecurity/page.tsx')

  assert.match(scanner, /DependencyScanProgressHandler/)
  assert.match(scanner, /stage: 'repository'/)
  assert.match(scanner, /stage: 'manifests'/)
  assert.match(scanner, /stage: 'advisories'/)
  assert.match(scanner, /done: index \+ 1/)
  assert.match(route, /application\/x-ndjson/)
  assert.match(route, /type: 'heartbeat'/)
  assert.match(route, /setInterval\(\(\) => send/)
  assert.match(route, /type: 'complete'/)
  assert.match(page, /CyberActivityPanel/)
  assert.match(page, /stream: true/)
  assert.match(page, /res\.body\.getReader\(\)/)
  assert.match(page, /event\.type === 'progress' \|\| event\.type === 'heartbeat'/)
  assert.doesNotMatch(page, /Math\.random|fakeProgress|simulatedProgress/)
})

test('Cybersecurity activity monitor distinguishes heartbeat from progress', () => {
  const panel = read('../components/cybersecurity/CyberActivityPanel.tsx')
  const onboard = read('../../ONBOARD.md')
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) assert.match(panel, new RegExp('\\b' + lang + ': \\{'))
  assert.match(panel, /role="progressbar"/)
  assert.match(panel, /heartbeatAge !== null && heartbeatAge > 45/)
  assert.match(panel, /stageAge !== null && stageAge > 900/)
  assert.match(panel, /sb-cyber-progress-flow/)
  assert.match(panel, /prefers-reduced-motion/)
  assert.match(onboard, /Cybersecurity Center must show server-driven live activity/)
  assert.match(onboard, /must never invent completion percentages/)
})
