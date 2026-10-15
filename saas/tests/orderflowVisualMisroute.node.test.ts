import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { detectConciergeVisualIntent, isConciergeVisualObjective, isExecutableSoftwareBrief } from '../lib/visuals/intent.ts'

const orderflow = `# OrderFlow — End-to-End Builder Acceptance Test
Build a complete, working OrderFlow application using Node.js and JavaScript.
Create all 15 files: package.json, README.md, index.js, src/catalog.js,
src/cart.js, src/inventory.js, src/orders.js, src/checkout.js, src/reports.js,
src/errors.js, test/catalog.test.js, test/cart.test.js, test/inventory.test.js,
test/orders.test.js, test/checkout.test.js.
Implement 20 automated tests. Execute npm test, node --test test/*.test.js,
and node index.js. Record the actual exit code. Generate an order, and provide
an inventory diagram in the README. Do not report success without verification.`

test('OrderFlow executable software acceptance never routes to images or person references', () => {
  assert.equal(isExecutableSoftwareBrief(orderflow), true)
  assert.equal(isConciergeVisualObjective(orderflow), false)
  assert.equal(detectConciergeVisualIntent(orderflow), null)
  assert.equal(detectConciergeVisualIntent(orderflow, { semanticVisual: true }), null)
})

test('actual visual creation is still available', () => {
  assert.equal(isExecutableSoftwareBrief('Draw a picture of a cat'), false)
  assert.ok(detectConciergeVisualIntent('Draw a picture of a cat'))
})

test('ordinary programming discussion does not require executable artifact markers', () => {
  assert.equal(isExecutableSoftwareBrief('Explain JavaScript promises'), false)
})

test('COS browser excludes coding objectives from deterministic and semantic visual routes', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(browser, /softwareExecutionObjective = isCosCodingObjective\\(prompt, routingContext\\)/)
  assert.match(browser, /directVisual = !softwareExecutionObjective && isConciergeVisualObjective\\(prompt\\)/)
  assert.match(browser, /semanticVisualEligible = !softwareExecutionObjective && !directVisual/)
})
