import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverBuilderProjectContext, formatBuilderProjectContext } from '../lib/builder/project-context.ts'

test('discovers npm scripts and an explicit test command from a staged project', () => {
  const context = discoverBuilderProjectContext([
    { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test', build: 'next build' } }) },
    { path: 'package-lock.json' },
    { path: 'src/math.test.js' },
  ])
  assert.equal(context.packageManager, 'npm')
  assert.equal(context.recommendedTestCommand, 'npm test')
  assert.deepEqual(context.scripts, { test: 'node --test', build: 'next build' })
  assert.match(formatBuilderProjectContext(context), /src\/math\.test\.js/)
})

test('uses node test discovery when no package test script exists', () => {
  const context = discoverBuilderProjectContext([
    { path: 'broken-index.js' },
    { path: 'tests/broken-index.spec.js' },
  ])
  assert.equal(context.packageManager, null)
  assert.equal(context.recommendedTestCommand, 'node --test tests/broken-index.spec.js')
})

test('does not invent a command for a malformed manifest', () => {
  const context = discoverBuilderProjectContext([{ path: 'package.json', content: '{not json' }])
  assert.equal(context.recommendedTestCommand, null)
  assert.deepEqual(context.scripts, {})
})
