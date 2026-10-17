// saas/tests/builderV2InterfaceMismatches.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { builderInterfaceMismatches, builderInterfaceRepairs, builderModuleInterface } from '../lib/builder/interface-mismatches.ts'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

type File = { path: string; content: string }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/builder-v2-interface-production-workspaces.json', import.meta.url), 'utf8')) as
  Record<string, { workspaceId: string; files: File[] }>

/** Run a command over files in a fresh directory, as the sandbox runner does. */
function runOn(files: readonly File[], command: string) {
  const dir = mkdtempSync(join(tmpdir(), 'builder-v2-iface-'))
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true })
      writeFileSync(join(dir, file.path), file.content)
    }
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
    const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60_000, env })
    return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: false }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const localRunner: BuilderRunnerPort = { async run({ command, files }) { return runOn(files, command) } }

for (const job of ['job-7c1f354e', 'job-629e2d0e']) {
  test(`production ${job}: the check names every "is not a function/constructor" failure the real test run hits`, () => {
    const { files } = fixture[job]
    const run = runOn(files, 'node --test test/*.test.js')
    assert.notEqual(run.exitCode, 0)
    const failures = [...new Set([...`${run.stdout}\n${run.stderr}`.matchAll(/^\s*(?:error: '|TypeError(?: \[Error\])?: )([\w$.]+) is not a (?:function|constructor)'?/gm)].map(m => m[1]))]
    assert.ok(failures.length > 0)
    const named = new Set(builderInterfaceMismatches(files).map(m => m.kind === 'missing_export' ? m.name : m.name.split('.prototype.')[1]))
    for (const failure of failures) assert.ok(named.has(failure.split('.').pop()!), `${failure} not named; named: ${[...named].join(', ')}`)
  })
}

test('production job-629e2d0e: repairs are grouped per module with the exact export statement to edit', () => {
  const { files } = fixture['job-629e2d0e']
  const repairs = builderInterfaceRepairs(builderInterfaceMismatches(files), files)
  const cart = repairs.find(repair => repair.module === 'src/cart.js')
  assert.deepEqual(cart?.missing.map(item => item.name), ['createCart'])
  const exportText = cart!.exportStatement!
  assert.ok(files.find(file => file.path === 'src/cart.js')!.content.includes(exportText), 'exportStatement is exact source text')
  const catalog = repairs.find(repair => repair.module === 'src/catalog.js')
  assert.deepEqual(catalog?.missing.map(item => item.name), [
    'Catalog.prototype.addProduct',
    // The same latent lost-update bug as job cfd64119, present before that run ever reached it.
    'Catalog.prototype.getProduct returns a copy (src/catalog.js:46); src/inventory.js mutates product.inventory on it',
  ])
  assert.equal(catalog?.missing[0].usedAt, 'test/checkout.test.js:11')
  assert.equal(catalog?.missing[1].usedAt, 'src/inventory.js:29')
})

test('production job-d8eff4a9 (after the export fix): the remaining failures are argument counts and chaining, all named', () => {
  const { files } = fixture['job-d8eff4a9']
  const run = runOn(files, 'node --test test/*.test.js')
  assert.notEqual(run.exitCode, 0)
  const output = `${run.stdout}\n${run.stderr}`
  // Real failures: constructors called without their catalog, a 3-argument CheckoutService, a non-chainable addItem.
  assert.match(output, /Cart requires a catalog/)
  assert.match(output, /InventoryManager requires a catalog/)
  assert.match(output, /A valid cart is required for checkout/)
  const mismatches = builderInterfaceMismatches(files)
  assert.equal(mismatches.filter(m => m.kind === 'missing_export' || m.kind === 'missing_method').length, 0)
  assert.deepEqual(mismatches.map(m => `${m.kind}:${m.name}@${m.test}:${m.line}`), [
    'wrong_argument_count:CheckoutService(orderStore, inventory) called with 3 arguments@test/checkout.test.js:16',
    'wrong_argument_count:Cart(catalog) called with 0 arguments@test/checkout.test.js:40',
    'wrong_argument_count:InventoryManager(catalog) called with 0 arguments@test/inventory.test.js:7',
    'wrong_argument_count:CheckoutService(orderStore, inventory) called with 3 arguments@test/orders.test.js:15',
    'method_not_chainable:Cart.prototype.addItem must return this@test/orders.test.js:39',
  ])
})

test('argument counts: defaults, rest and spread are respected; a class without a constructor accepts anything', () => {
  const files: File[] = [
    { path: 'src/a.js', content: 'class Store {\n  constructor(catalog, options = {}) { this.c = catalog }\n  add(x) { this.x = x; return this }\n  peek() { return this.x }\n}\nclass Bag {}\nfunction make(...items) { return items }\nmodule.exports = { Store, Bag, make }\n' },
    { path: 'test/a.test.js', content: "const { Store, Bag, make } = require('../src/a')\nnew Store(1)\nnew Store(1, {})\nnew Store(...args)\nnew Bag(1, 2, 3)\nmake(); make(1, 2, 3)\nconst s = new Store(1).add(2)\nnew Store(1).peek()\nconst bad = new Store()\nnew Store(1, {}, 3)\n" },
  ]
  assert.deepEqual(builderInterfaceMismatches(files).map(m => `${m.kind}:${m.name}@${m.line}`), [
    'wrong_argument_count:Store(catalog, options = {}) called with 0 arguments@9',
    'wrong_argument_count:Store(catalog, options = {}) called with 3 arguments@10',
  ])
})

test('a consistent project reports nothing: exports, aliases, statics, factories, inherited methods', () => {
  const files: File[] = [
    { path: 'src/base.js', content: 'class Base {\n  describe() { return "b" }\n}\nmodule.exports = { Base }\n' },
    { path: 'src/shop.js', content: "const { Base } = require('./base')\nclass Shop extends Base {\n  constructor() { super(); this.items = [] }\n  add(item) { this.items.push(item) }\n  get size() { return this.items.length }\n  total = () => 0\n}\nfunction createShop() { return new Shop() }\nconst helper = (x) => x\nmodule.exports = { Shop, createShop, helperAlias: helper, 'quoted': 1 }\n" },
    { path: 'src/single.js', content: 'class Solo { static make() { return new Solo() } }\nSolo.VERSION = 1\nmodule.exports = Solo\n' },
    { path: 'src/props.js', content: 'exports.one = 1\nmodule.exports.two = 2\n' },
    { path: 'test/shop.test.js', content: "const { Shop, createShop, helperAlias: h, quoted } = require('../src/shop')\nconst solo = require('../src/single.js')\nconst props = require('../src/props')\nconst s = new Shop()\ns.add(1); s.describe(); s.total()\nconst f = createShop()\nf.add(2)\nsolo.make(); solo.VERSION; props.one; props.two\n" },
  ]
  assert.deepEqual(builderInterfaceMismatches(files), [])
  // Shop extends a class from another file, so its methods are unknown here and no method is reported missing.
  assert.equal(builderModuleInterface('src/shop.js', files[1].content)?.classes.Shop, undefined)
})

test('a missing export, a missing property import and a missing method are each reported once', () => {
  const files: File[] = [
    { path: 'src/cart.js', content: 'class Cart {\n  add(id) { return id }\n}\nmodule.exports = { Cart }\n' },
    { path: 'test/cart.test.js', content: "const { Cart, createCart } = require('../src/cart')\nconst cartModule = require('../src/cart.js')\nconst c = new Cart()\nc.add(1)\nc.addItem(1)\nc.addItem(2)\ncartModule.totals()\n" },
  ]
  assert.deepEqual(builderInterfaceMismatches(files).map(m => `${m.kind}:${m.name}@${m.line}`), [
    'missing_export:createCart@1',
    'missing_export:totals@7',
    'missing_method:Cart.prototype.addItem@5',
  ])
})

const objective = [
  '# MiniShop',
  'Create all 4 files:',
  '```text',
  'minishop/',
  '├── package.json',
  '├── src',
  '│   └── catalog.js',
  '└── test',
  '    ├── catalog.test.js',
  '    └── more.test.js',
  '```',
  '## Mandatory verification',
  'Execute all one commands:',
  '```bash',
  'node --test test/*.test.js',
  '```',
].join('\n')

test('Builder V2 shows tests the real interface of sources already written', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'package.json', '{"name":"minishop","scripts":{"test":"node --test test/*.test.js"}}')
  await workspace.writeFile('w', 'src/catalog.js', 'class Catalog {\n  addProduct(p) { return p }\n}\nfunction createCatalog() { return new Catalog() }\nmodule.exports = { Catalog, createCatalog }\n')
  const prompts: Array<Record<string, unknown>> = []
  const agent = new BuilderV2Agent({ async generate(request) { prompts.push(JSON.parse(String(request.prompt))); return null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  await agent.run({ workspaceId: 'w', objective, maxSteps: 1, retryDelay: async () => undefined })
  assert.deepEqual(prompts[0].writtenModuleInterfaces, [{ module: 'src/catalog.js', exports: ['Catalog', 'createCatalog'], classes: { Catalog: ['addProduct'] }, factories: { createCatalog: 'Catalog' },
    signatures: { 'Catalog.prototype.addProduct': 'Catalog.prototype.addProduct(p)', createCatalog: 'createCatalog()' } }])
  assert.equal(prompts[0].interfaceMismatches, undefined)
})

test('Builder V2 lists every mismatch at once, and one batched edit from the exact export statement verifies the build', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'package.json', '{"name":"minishop","scripts":{"test":"node --test test/*.test.js"}}')
  await workspace.writeFile('w', 'src/catalog.js', "'use strict'\nclass Shelf {\n  constructor() { this.items = new Map() }\n  createProduct(p) { this.items.set(p.id, p); return p }\n  getProduct(id) { return this.items.get(id) }\n}\nmodule.exports = { Shelf }\n")
  await workspace.writeFile('w', 'test/catalog.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { createShelf } = require('../src/catalog')\ntest('creates', () => { const c = createShelf(); c.addProduct({ id: 'a' }); assert.equal(c.getProduct('a').id, 'a') })\n")
  await workspace.writeFile('w', 'test/more.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { Shelf } = require('../src/catalog')\ntest('lists', () => { const c = new Shelf(); c.addProduct({ id: 'b' }); assert.deepEqual(c.listProducts(), [{ id: 'b' }]) })\n")
  const prompts: Array<Record<string, any>> = []
  const agent = new BuilderV2Agent({
    async generate(request) {
      const prompt = JSON.parse(String(request.prompt))
      prompts.push(prompt)
      if (prompts.length > 1) return JSON.stringify({ type: 'finish', summary: 'done' })
      const repair = prompt.interfaceMismatches?.[0]
      return JSON.stringify({ type: 'tools', actions: [{ tool: 'edit_file', path: repair.module, search: repair.exportStatement,
        replace: 'Shelf.prototype.addProduct = Shelf.prototype.createProduct\nShelf.prototype.listProducts = function () { return [...this.items.values()] }\nfunction createShelf() { return new Shelf() }\nmodule.exports = { Shelf, createShelf }' }] })
    },
  }, new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'w', objective, maxSteps: 6, retryDelay: async () => undefined })

  const first = prompts[0]
  // The host ran the suite first (real failure), and the same turn carried every mismatch from both tests.
  assert.equal(first.latestFailedTest !== undefined && first.latestFailedTest !== '', true)
  assert.deepEqual(first.interfaceMismatches, [{
    module: 'src/catalog.js', exportStatement: 'module.exports = { Shelf }', exports: ['Shelf'],
    missing: [
      { name: 'createShelf', kind: 'missing_export', usedAt: 'test/catalog.test.js:3' },
      { name: 'Shelf.prototype.addProduct', kind: 'missing_method', usedAt: 'test/more.test.js:4' },
      { name: 'Shelf.prototype.listProducts', kind: 'missing_method', usedAt: 'test/more.test.js:4' },
    ],
  }])
  assert.deepEqual(first.nextRecommendedAction.actions, [{ tool: 'edit_file', path: 'src/catalog.js' }])
  assert.ok(Object.keys(first.openFiles).includes('src/catalog.js'))
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(outcome.reason, 'verified')
  // One model reply repaired everything; the host's own run after it is the proof.
  assert.equal(prompts.length, 1)
  const lastRun = outcome.steps.findLast(step => step.tool === 'run_tests')
  assert.equal(lastRun?.ok, true)
})

test('Builder V2 reports argument-count and chaining mismatches in the same list, and one batched edit verifies the build', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'package.json', '{"name":"minishop","scripts":{"test":"node --test test/*.test.js"}}')
  await workspace.writeFile('w', 'src/catalog.js', "'use strict'\nclass Rack {\n  constructor(owner) {\n    if (!owner) throw new TypeError('Rack requires an owner')\n    this.owner = owner\n    this.items = []\n  }\n  addProduct(p) { this.items.push(p); return p }\n  listProducts() { return this.items }\n}\nmodule.exports = { Rack }\n")
  await workspace.writeFile('w', 'test/catalog.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { Rack } = require('../src/catalog')\ntest('adds', () => { const c = new Rack(); c.addProduct({ id: 'a' }); assert.equal(c.listProducts().length, 1) })\n")
  await workspace.writeFile('w', 'test/more.test.js', "const test = require('node:test')\nconst assert = require('node:assert')\nconst { Rack } = require('../src/catalog')\ntest('chains', () => { assert.deepEqual(new Rack('me').addProduct({ id: 'b' }).listProducts(), [{ id: 'b' }]) })\n")
  const prompts: Array<Record<string, any>> = []
  const agent = new BuilderV2Agent({
    async generate(request) {
      const prompt = JSON.parse(String(request.prompt))
      prompts.push(prompt)
      if (prompts.length > 1) return JSON.stringify({ type: 'finish', summary: 'done' })
      return JSON.stringify({ type: 'tools', actions: [
        { tool: 'edit_file', path: 'src/catalog.js', search: "  constructor(owner) {\n    if (!owner) throw new TypeError('Rack requires an owner')\n", replace: '  constructor(owner = null) {\n' },
        { tool: 'edit_file', path: 'src/catalog.js', search: 'addProduct(p) { this.items.push(p); return p }', replace: 'addProduct(p) { this.items.push(p); return this }' },
      ] })
    },
  }, new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'w', objective, maxSteps: 6, retryDelay: async () => undefined })

  assert.deepEqual(prompts[0].interfaceMismatches?.[0]?.missing, [
    { name: 'Rack(owner) called with 0 arguments', kind: 'wrong_argument_count', usedAt: 'test/catalog.test.js:4' },
    { name: 'Rack.prototype.addProduct must return this', kind: 'method_not_chainable', usedAt: 'test/more.test.js:4' },
  ])
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(prompts.length, 1)
  assert.equal(outcome.steps.findLast(step => step.tool === 'run_tests')?.ok, true)
})

test('chaining needs evidence: a consumed scalar result is not a mismatch, a required instance is', () => {
  const files: File[] = [
    { path: 'src/till.js', content: "class Till {\n  constructor() { this.items = [] }\n  add(x) { this.items.push(x); return x }\n  total() { return this.items.length }\n  save() { return 'id-1' }\n}\nclass Desk {\n  ring(till, note) { return till.total() }\n}\nmodule.exports = { Till, Desk }\n" },
    { path: 'test/till.test.js', content: "const assert = require('node:assert')\nconst { Till, Desk } = require('../src/till')\nassert.equal(new Till().total(), 0)\nconst id = new Till().save()\nconsole.log(id)\nnew Till().add(1)\nconst desk = new Desk()\ndesk.ring(new Till().add(1), 'x')\nnew Till().add(2).total()\n" },
  ]
  // Lines 3-6 consume a number/string legitimately. Line 8 passes the result to a parameter named `till`;
  // line 9 calls another Till method on it. Both need the instance, and add() does not return it.
  assert.deepEqual(builderInterfaceMismatches(files).map(m => `${m.kind}:${m.name}@${m.line}`), [
    'method_not_chainable:Till.prototype.add must return this@8',
  ])
})

test('a directly exported class (module.exports = Cls) is bound through a plain require and checked', () => {
  const files: File[] = [
    { path: 'src/vault.js', content: "class Vault {\n  constructor(key) { if (!key) throw new Error('key') ; this.key = key }\n  open() { return true }\n}\nmodule.exports = Vault\n" },
    { path: 'test/vault.test.js', content: "const vault = require('../src/vault')\nconst v = new vault()\nv.open()\nv.close()\n" },
  ]
  assert.deepEqual(builderInterfaceMismatches(files).map(m => `${m.kind}:${m.name}@${m.line}`), [
    'wrong_argument_count:Vault(key) called with 0 arguments@2',
    'missing_method:Vault.prototype.close@4',
  ])
})

test('production job-cfd64119: the lost-update bug is reported as a copy mutation with both sides named', () => {
  const { files } = fixture['job-cfd64119']
  const run = runOn(files, 'node --test test/*.test.js')
  assert.notEqual(run.exitCode, 0)
  // Stock never moves: deduct() mutated the copy getProduct() returned.
  assert.match(`${run.stdout}\n${run.stderr}`, /expected: 2\n\s+actual: 5|actual: 5/)
  assert.deepEqual(builderInterfaceMismatches(files).map(m => `${m.kind}:${m.name}@${m.test}:${m.line}`), [
    'mutates_defensive_copy:Catalog.prototype.getProduct returns a copy (src/catalog.js:54); src/inventory.js mutates product.quantity on it@src/inventory.js:31',
  ])
  // The one-line repair the finding points at makes those deductions stick.
  const repaired = files.map(file => file.path !== 'src/catalog.js' ? file : { ...file, content: file.content.replace("    return { ...product };\n  }\n\n  listProducts", '    return product;\n  }\n\n  listProducts') })
  assert.notEqual(repaired.find(file => file.path === 'src/catalog.js')!.content, files.find(file => file.path === 'src/catalog.js')!.content)
  const before = [...`${run.stdout}`.matchAll(/^# pass (\d+)/gm)].map(m => Number(m[1]))[0]
  const after = [...runOn(repaired, 'node --test test/*.test.js').stdout.matchAll(/^# pass (\d+)/gm)].map(m => Number(m[1]))[0]
  assert.ok(after > before, `${before} -> ${after}`)
  assert.deepEqual(builderInterfaceMismatches(repaired), [])
})

test('copy mutation: not reported for a stored-object getter, a same-module mutation, or an ambiguous method name', () => {
  const stored: File[] = [
    { path: 'src/store.js', content: 'class Depot {\n  constructor() { this.items = new Map() }\n  get(id) { return this.items.get(id) }\n  snapshot(id) { return { ...this.items.get(id) } }\n  bump(id) { const item = this.snapshot(id); item.n += 1; return item }\n}\nmodule.exports = { Depot }\n' },
    { path: 'src/user.js', content: "const { Depot } = require('./store')\nclass User {\n  constructor(store) { this.store = store }\n  inc(id) { const item = this.store.get(id); item.n += 1 }\n  read(id) { const copy = this.store.snapshot(id); return copy.n }\n}\nmodule.exports = { User }\n" },
  ]
  assert.deepEqual(builderInterfaceMismatches(stored), [])
  const mutated = stored.map(file => file.path !== 'src/user.js' ? file : { ...file, content: file.content.replace('const copy = this.store.snapshot(id); return copy.n', 'const copy = this.store.snapshot(id); copy.n -= 1; return copy.n') })
  assert.deepEqual(builderInterfaceMismatches(mutated).map(m => `${m.kind}@${m.test}:${m.line}`), ['mutates_defensive_copy@src/user.js:5'])
  const ambiguous: File[] = [...mutated, { path: 'src/annex.js', content: 'class Annex {\n  snapshot() { return { ...this.x }\n  }\n}\nmodule.exports = { Annex }\n' }]
  assert.deepEqual(builderInterfaceMismatches(ambiguous), [])
})
