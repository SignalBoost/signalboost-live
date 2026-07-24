import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = () => readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx', import.meta.url), 'utf8')

test('a new list request aborts its predecessor and binds the GET request to its signal', () => {
  const source = client()
  assert.match(source, /const listController = useRef<AbortController \| null>\(null\)/)
  assert.match(source, /async function load[\s\S]*?listController\.current\?\.abort\(\)[\s\S]*?const controller = new AbortController\(\)/)
  assert.match(source, /reviews\?\$\{params\}[\s\S]*?method: 'GET', cache: 'no-store', signal: controller\.signal/)
})

test('a stale list response cannot replace the newest list state or display an error', () => {
  const source = client()
  assert.match(source, /const listRequest = useRef\(0\)/)
  assert.match(source, /if \(listRequest\.current !== request \|\| controller\.signal\.aborted\) return\n      setItems\(payload\.items\)/)
  assert.match(source, /catch \(cause\) \{\n      if \(listRequest\.current !== request \|\| controller\.signal\.aborted\) return/)
})

test('a new detail request aborts its predecessor and binds the GET request to its signal', () => {
  const source = client()
  assert.match(source, /const detailController = useRef<AbortController \| null>\(null\)/)
  assert.match(source, /async function openDetail[\s\S]*?detailController\.current\?\.abort\(\)[\s\S]*?const controller = new AbortController\(\)/)
  assert.match(source, /reviews\/\$\{encodeURIComponent\(reviewId\)\}[\s\S]*?method: 'GET', cache: 'no-store', signal: controller\.signal/)
})

test('a stale detail response cannot replace the current review or display an error', () => {
  const source = client()
  assert.match(source, /if \(detailRequest\.current === request && !controller\.signal\.aborted\) setDetail\(payload\)/)
  assert.match(source, /catch \(cause\) \{ if \(detailRequest\.current === request && !controller\.signal\.aborted\) setDetailError/)
})

test('closing the detail panel and unmounting abort active review requests', () => {
  const source = client()
  assert.match(source, /function closeDetail\(\) \{\n    detailController\.current\?\.abort\(\)/)
  assert.match(source, /useEffect\(\(\) => \(\) => \{\n    listController\.current\?\.abort\(\)\n    detailController\.current\?\.abort\(\)/)
})

test('Mission Review remains GET-only and exposes no mutation controls', () => {
  const source = client()
  assert.equal((source.match(/method: 'GET'/g) || []).length, 3)
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
  const controls = source.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
  assert.doesNotMatch(controls.join(' '), /approve|reject|resolve|retry|replay|execute|repair|cancel|delete|edit|GitHub issue|pull request|trigger CI/i)
})
