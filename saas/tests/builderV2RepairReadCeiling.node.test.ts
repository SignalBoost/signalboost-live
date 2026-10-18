import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('failed host test preloads source and stops repeated read-only repair loops', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w','src/cart.js','module.exports = { calculateTotals() { return 0 } }')
  await workspace.writeFile('w','test/cart.test.js',"const { getTotal } = require('../src/cart')")
  await workspace.writeFile('w','src/catalog.js','module.exports = {}')
  await workspace.writeFile('w','src/orders.js','module.exports = {}')
  const dispatcher = new BuilderV2Dispatcher(workspace, {
    async run() { return { exitCode: 1, stdout: 'test/cart.test.js: getTotal is not a function', stderr: '', timedOut: false } },
  })
  let observedContext = false
  let nextRead = 0
  const readPaths = ['src/cart.js','test/cart.test.js','src/catalog.js','src/orders.js']
  const ai = { async generate({prompt}: {prompt:string}) {
    const value = JSON.parse(prompt) as { openFiles?: Record<string,string>; latestFailedTest?: string }
    if(value.latestFailedTest) observedContext = Boolean(value.openFiles?.['src/cart.js'] && value.openFiles?.['test/cart.test.js'])
    return JSON.stringify({type:'tool',action:{tool:'read_file',path:readPaths[Math.min(nextRead++,readPaths.length-1)]}})
  } }
  const objective = 'Create these files:\nsrc/cart.js\ntest/cart.test.js\n\nRun:\nnpm test'
  const result = await new BuilderV2Agent(ai,dispatcher,workspace).run({workspaceId:'w',objective,maxSteps:20})
  assert.equal(observedContext,true)
  assert.equal(result.reason,'builder_v2_repair_read_limit')
  assert.ok(result.steps.filter(step=>step.tool==='read_file').length<=4)
  assert.ok(nextRead > 4, 'agent gets feedback and additional chances to edit before the bounded stop')
  assert.match((await workspace.readFile('w','src/cart.js'))?.content ?? '', /builder_stub_not_implemented: getTotal/)
  assert.equal(result.ok, false, 'a throwing placeholder is not a verified implementation')
})

test('failed inventory import is targeted for repair and verified by the host', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'src/inventory.js', 'module.exports = {}')
  await workspace.writeFile('w', 'test/inventory.test.js',
    "const { createInventory } = require('../src/inventory.js')\n")
  let runs = 0
  const dispatcher = new BuilderV2Dispatcher(workspace, {
    async run() {
      runs++
      const file = await workspace.readFile('w', 'src/inventory.js')
      const fixed = file?.content.includes('createInventory')
      return { exitCode: fixed ? 0 : 1,
        stdout: fixed ? '# tests 1\n# pass 1\n# fail 0' :
          'test/inventory.test.js:10:1\nTypeError: createInventory is not a function',
        stderr: '', timedOut: false }
    },
  })
  let sawTarget = false
  const ai = { async generate({prompt}: {prompt: string}) {
    const value = JSON.parse(prompt) as {
      activeRepair?: { targets?: Array<{test: string; sources: string[]}> }
      latestFailedTest?: string
    }
    if (value.latestFailedTest) {
      sawTarget = value.activeRepair?.targets?.some(target =>
        target.test === 'test/inventory.test.js' && target.sources.includes('src/inventory.js')) ?? false
    }
    return JSON.stringify({type: 'tool', action: {tool: 'edit_file', path: 'src/inventory.js',
      search: 'module.exports = {}',
      replace: 'module.exports = { createInventory() { return {} } }'}})
  } }
  const objective = 'Create these files:\nsrc/inventory.js\ntest/inventory.test.js\n\nRun:\nnpm test'
  const result = await new BuilderV2Agent(ai, dispatcher, workspace).run({
    workspaceId: 'w', objective, maxSteps: 8,
  })
  // Host stub writes the export, and the model still receives targeted repair evidence.
  assert.equal(sawTarget, true)
  assert.match((await workspace.readFile('w', 'src/inventory.js'))?.content ?? '', /builder_stub_not_implemented: createInventory/)
  assert.equal(result.ok, true)
  assert.equal(result.reason, 'verified')
  assert.equal(runs, 2)
})
