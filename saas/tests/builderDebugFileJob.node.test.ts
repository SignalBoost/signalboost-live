import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractBuilderSourceFiles,
  planDebugFileJob,
} from '../lib/builder/debug-file-job.ts'

test('debug planning requires an explicit action and one to four small supported source files', () => {
  assert.equal(planDebugFileJob('Debug this.', []), null)
  assert.deepEqual(planDebugFileJob('Debug this.', [
    { path: 'one.js', content: 'x' },
    { path: 'two.js', content: 'y' },
  ]), {
    path: 'one.js',
    command: "node 'one.js'",
    runtime: 'node',
    files: ['one.js', 'two.js'],
  })
  assert.equal(planDebugFileJob('Debug this.', [{ path: 'notes.txt', content: 'x' }]), null)
  assert.equal(planDebugFileJob(
    '16:19:34 Vercel CLI 59.3.0\n16:20:11 Error: Command "npm test" exited with 1',
    [{ path: 'broken.js', content: 'x' }],
  ), null)
  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'a.js', content: '1' },
    { path: 'b.js', content: '2' },
    { path: 'c.js', content: '3' },
    { path: 'd.js', content: '4' },
    { path: 'e.js', content: '5' },
  ]), null)
})

test('Concierge data-URL attachments decode into editable source files', () => {
  const content = 'console.log(1)\n'
  const files = extractBuilderSourceFiles([
    {
      name: 'app.js',
      mimeType: 'text/javascript',
      dataUrl: `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`,
    },
    { name: 'notes.txt', dataUrl: `data:text/plain;base64,${Buffer.from('log only').toString('base64')}` },
  ])
  assert.deepEqual(files, [{ path: 'app.js', content }])
})


test('complete application intake retains JSON and bypasses the single-file shortcut', () => {
  const files = [
    { path: 'package.json', content: '{"dependencies":{"is-number":"7.0.0"}}' },
    { path: 'money.js', content: 'require("is-number")' },
    { path: 'report.js', content: 'require("./money")' },
    { path: 'cli.js', content: 'require("./report")' },
    { path: 'sample.json', content: '[]' },
    { path: 'report.test.js', content: 'require("./sample.json")' },
  ]
  assert.deepEqual(extractBuilderSourceFiles(files), files)
  assert.equal(planDebugFileJob('Repair this application. Run: npm test.', files), null)
  assert.equal(planDebugFileJob('Repair this application.', files), null)
  assert.equal(planDebugFileJob('Repair this file. Run: npm test.', [files[1]]), null)
  assert.equal(planDebugFileJob('Repair this file. Run: node money.js. Run: node cli.js.', [files[1]]), null)
  assert.equal(planDebugFileJob('Repair this file. Run: node money.js.', [files[1]]), null)
  assert.ok(planDebugFileJob('Repair this file.', [files[1]]))
})

test('unparsed execution requests cannot use the inferred single-file proof', () => {
  const files = [{ path: 'app.js', content: 'console.log("ok")' }]
  for (const prompt of [
    'Repair app.js. Run `node verify.js`.',
    'Repair app.js and execute node verify.js.',
    'Repair app.js. Run: node app.js. Also run `node verify.js`.',
    'Repair app.js; verify by running `node verify.js`.',
    'Repair app.js; test with `node verify.js`.',
    'Repair app.js; invoke ./verify.sh.',
    'Repair app.js; verification command: `node verify.js`.',
  ]) assert.equal(planDebugFileJob(prompt, files), null)
})
