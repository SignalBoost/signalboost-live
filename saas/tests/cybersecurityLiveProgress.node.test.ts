import test from 'node:test'
import assert from 'node:assert/strict'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

// Re-run against the current main integration surface, including Press & Media host dependencies.
const read = (path: string) => readUiSource(new URL(path, import.meta.url))

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
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) assert.match(panel, new RegExp('\\b' + lang + ': \\{'))
  assert.match(panel, /role="progressbar"/)
  assert.match(panel, /heartbeatAge !== null && heartbeatAge > 45/)
  assert.match(panel, /stageAge !== null && stageAge > 900/)
  assert.match(panel, /sb-cyber-progress-flow/)
  assert.match(panel, /prefers-reduced-motion/)
  assert.doesNotMatch(panel, /Math\.random|fakeProgress|simulatedProgress/)
})