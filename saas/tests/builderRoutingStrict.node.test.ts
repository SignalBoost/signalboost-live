import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isConciergeBuilderObjective,
  isCosCodingObjective,
} from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import { planDebugFileJob } from '../lib/builder/debug-file-job.ts'

test('debug words and ordinary questions do not acquire Builder authority', () => {
  assert.equal(isConciergeBuilderObjective('Debug this.'), false)
  assert.equal(isConciergeBuilderObjective('The Builder timed out. Fix it.'), false)
  assert.equal(isCosCodingObjective('The Builder is not working. Repair it.'), false)
  assert.equal(isConciergeBuilderObjective('Does a pay gap between men and women exist?'), false)
  assert.equal(isConciergeBuilderObjective('What model are you?'), false)
  assert.equal(isConciergeBuilderObjective('List 20 football clubs.'), false)
})

test('one attached source file makes an explicit debug request eligible', () => {
  const context = { attachmentNames: ['broken.js'], attachmentMimeTypes: ['text/javascript'], attachmentSizes: [42] }
  assert.equal(isConciergeBuilderObjective('Debug the attached file in Builder.', context), true)
  assert.equal(isCosCodingObjective('Debug the attached file in Builder.', context), true)
  assert.equal(isConciergeBuilderObjective('Tell me what this attachment is.', context), false)
})

test('a dropped source file is enough even when the human writes casually or nothing', () => {
  const context = { attachmentNames: ['app.py'], attachmentMimeTypes: ['text/x-python'], attachmentSizes: [18] }
  assert.equal(isConciergeBuilderObjective('fix this', context), true)
  assert.equal(isConciergeBuilderObjective('Please fix/debug this', context), true)
  assert.equal(isConciergeBuilderObjective('não funciona', context), true)
  assert.equal(isConciergeBuilderObjective('help', context), true)
  assert.equal(isConciergeBuilderObjective('', context), true)
  assert.equal(isCosCodingObjective('fix this', context), true)
  assert.equal(isConciergeBuilderObjective('fix this'), false)
  assert.equal(isConciergeBuilderObjective('Please fix/debug this'), false)
})

test('broken / not working / not functional plus a source attachment starts Builder', () => {
  const context = { attachmentNames: ['app.py'], attachmentMimeTypes: ['text/x-python'], attachmentSizes: [18] }
  assert.equal(isConciergeBuilderObjective('This attached file is broken.', context), true)
  assert.equal(isConciergeBuilderObjective('The attached script is not working.', context), true)
  assert.equal(isConciergeBuilderObjective('The attached app.py is not functional.', context), true)
  assert.equal(isConciergeBuilderObjective('This attached file is broken.'), false)
  assert.equal(isConciergeBuilderObjective('Builder still not functional.'), false)
  assert.equal(isConciergeBuilderObjective('Builder still not functional.', context), true)
})

test('file paths, stack traces, code fences, languages, and named-file creation are concrete coding evidence', () => {
  assert.equal(isConciergeBuilderObjective('Fix app/api/route.ts.'), true)
  assert.equal(isConciergeBuilderObjective('Debug this TypeError: boom at main (/tmp/broken.js:1:7).'), true)
  assert.equal(isConciergeBuilderObjective('Repair this Python function.\n```python\nprint(missing)\n```'), true)
  assert.equal(isConciergeBuilderObjective('Write a TypeScript function that adds two numbers.'), true)
  assert.equal(isConciergeBuilderObjective('Create a responsive landing page.'), true)
  assert.equal(isConciergeBuilderObjective('Create hello.js that prints Hello from COS Builder. Run it with Node.'), true)
  assert.equal(isCosCodingObjective('Create hello.js that prints Hello from COS Builder. Run it with Node.'), true)
})

test('pasted source code executes only when it is source-dominant or the user explicitly requests execution', () => {
  const sourceOnly = [
    'function broken() {',
    '  console.log(missing)',
    '}',
    'broken()',
  ].join('\n')
  assert.equal(isConciergeBuilderObjective(sourceOnly), true)

  const explainOnly = `Explain what this code does.\n${sourceOnly}`
  assert.equal(isConciergeBuilderObjective(explainOnly), false)

  const explicitRepair = `Please fix this code and run it.\n${sourceOnly}`
  assert.equal(isConciergeBuilderObjective(explicitRepair), true)
})

test('a COS/Builder meta-discussion with embedded example code stays in COS until execution is explicit', () => {
  const metaDiscussion = [
    'when i prompted the builder directly to debug something it works, but when i place the same code to be debugged via COS it does not work. how to fix it?',
    '',
    'This looks like an integration gap between Builder and COS. The routing layer may be treating the example as execution instead of discussion.',
    '',
    '## Patch outline',
    'The example below illustrates the proposed router behavior; it is not source supplied for execution.',
    '',
    'function routeInput(input: string) {',
    '  if (input.includes("Error:")) return "execution"',
    '  return "interpretation"',
    '}',
  ].join('\n')

  assert.equal(isConciergeBuilderObjective(metaDiscussion), false)
  assert.equal(isConciergeBuilderObjective(`Fix the COS-to-Builder routing bug described below.\n${metaDiscussion}`), true)
})

test('pasted Vercel logs and large History dumps never route to Builder', () => {
  const log = ['16:19:34 Vercel CLI 59.3.0', '16:20:11 Error: Command "npm test" exited with 1'].join('\n')
  assert.equal(isConciergeBuilderObjective(`Debug this timeout.\n${log}`), false)
  assert.equal(isCosCodingObjective(`Fix this build.\n${log}`), false)

  const history = Array.from({ length: 2_000 }, (_, index) => `User: prompt ${index}\nAssistant: response ${index}`).join('\n')
  assert.ok(history.length > 64_000)
  assert.equal(isConciergeBuilderObjective(`Debug this file.\n${history}`, { attachmentNames: ['broken.js'] }), false)
})

test('logs become bounded debug evidence only when editable source files are supplied', () => {
  const objective = 'Fix the attached file.\n16:19:34 Vercel CLI 59.3.0\nReferenceError: result is not defined'
  assert.deepEqual(planDebugFileJob(objective, [{ path: 'broken.js', content: 'console.log(result)' }]), {
    path: 'broken.js', command: "node 'broken.js'", runtime: 'node', files: ['broken.js'],
  })
  assert.equal(planDebugFileJob(objective, []), null)
})
