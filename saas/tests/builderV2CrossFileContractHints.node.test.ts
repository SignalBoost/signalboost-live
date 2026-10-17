import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCrossFileContractHints } from '../lib/builder/cross-file-contract-hints.ts'
import type { BuilderWorkspacePort } from '../lib/builder/contracts.ts'

test('Builder V2 includes cross-file CommonJS API hints without treating them as verification', async () => {
  const content: Record<string, string> = {
    'src/cart.js': "class Cart {\n  addItem(productId, quantity = 1) { return [] }\n  calculateTotals() { return { total: 0 } }\n}\nfunction createCart(catalog) { return new Cart(catalog) }\nmodule.exports = { Cart, createCart };",
    'test/cart.test.js': "const { createCart } = require('../src/cart');\nconst cart = createCart(); cart.getTotal();",
  }
  const workspace = {
    async readFile(_workspaceId: string, path: string) {
      const code = content[path]
      return code === undefined ? null : { path, content: code, updatedAt: 0 }
    },
  } as BuilderWorkspacePort
  const hints = await builderCrossFileContractHints(workspace, 'w', Object.keys(content))
  assert.ok(hints.some(h => h.includes('src/cart.js') && h.includes('createCart') && h.includes('calculateTotals')))
  assert.ok(hints.some(h => h.includes('test/cart.test.js') && h.includes('src/cart')))
  assert.deepEqual(await builderCrossFileContractHints(undefined, 'w', Object.keys(content)), [])
})

test('Builder V2 does not emit a fabricated API hint when no CommonJS exports exist', async () => {
  const workspace = { async readFile() { return { path: 'src/a.js', content: 'const x = 1', updatedAt: 0 } } } as unknown as BuilderWorkspacePort
  assert.deepEqual(await builderCrossFileContractHints(workspace, 'w', ['src/a.js']), [])
})
