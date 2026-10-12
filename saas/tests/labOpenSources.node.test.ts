// saas/tests/labOpenSources.node.test.ts
// Open sources in the customer LAB: free material becomes training examples the existing examples path accepts,
// with every answer carrying its source link; the route is keyless, member-gated and observed; the panel offers it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAB_OPEN_SOURCES, buildOpenSourceExamples, chunkText, cleanTopic, examplesToJsonl, hasTrainingRights, sourceUrl, type OpenSourceDocument } from '../lib/lab/labOpenSources.ts'
import { rowsFromExamples } from '../lib/ai/cos/labCustomerTraining.ts'

const sentence = (i: number, tag = '') => `Sentence number ${i}${tag} explains one practical point about the subject in plain words. `
const doc = (sourceId: OpenSourceDocument['sourceId'], n: number, sentences: number): OpenSourceDocument => ({
  sourceId, uri: `https://example.org/${sourceId}/${n}`, title: `${sourceId} document ${n}`,
  text: Array.from({ length: sentences }, (_, i) => sentence(i, ` of ${sourceId} ${n}`)).join(''), license: 'CC0',
})

test('sources are listed alphabetically by name', () => {
  const names = LAB_OPEN_SOURCES.map(item => item.name)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  assert.deepEqual(LAB_OPEN_SOURCES.map(item => item.id), ['huggingface_datasets', 'gutenberg', 'wikipedia'])
})

test('only material whose licence allows training is used', () => {
  assert.equal(hasTrainingRights('CC BY-SA 4.0'), true)
  assert.equal(hasTrainingRights('public domain'), true)
  assert.equal(hasTrainingRights('cc0 public-domain GitHub-CC0 software corpus'), true)
  assert.equal(hasTrainingRights('research metadata mirror; catalog metadata is CC0; underlying paper training rights not asserted'), false)
  assert.equal(hasTrainingRights('S2ORC corpus mirror (ODC-By 1.0); underlying paper rights not asserted'), false)
  assert.equal(hasTrainingRights(''), false)
  const docs = [doc('wikipedia', 1, 60), { ...doc('wikipedia', 2, 60), license: 'underlying paper training rights not asserted' }]
  assert.ok(buildOpenSourceExamples('t', docs).every(example => example.uri.endsWith('/wikipedia/1')))
})

test('Hugging Face dataset references become their https dataset page; other schemes are refused', () => {
  assert.equal(sourceUrl('hf://datasets/ethanolivertroy/nist-cybersecurity-training#train:42'), 'https://huggingface.co/datasets/ethanolivertroy/nist-cybersecurity-training')
  assert.equal(sourceUrl('https://en.wikipedia.org/wiki/Solar_panel'), 'https://en.wikipedia.org/wiki/Solar_panel')
  assert.equal(sourceUrl('http://example.org/x'), null)
  assert.equal(sourceUrl('javascript:alert(1)'), null)
  const hfOnly = buildOpenSourceExamples('t', [{ ...doc('huggingface_datasets', 1, 60), uri: 'hf://datasets/org/data#train:1' }])
  assert.ok(hfOnly.length > 0)
  assert.match(hfOnly[0].response, /https:\/\/huggingface\.co\/datasets\/org\/data/)
})

test('topics are one clean short line', () => {
  assert.equal(cleanTopic('  solar\n\tpanels  '), 'solar panels')
  assert.equal(cleanTopic('x'.repeat(500)).length, 120)
})

test('text splits into passages at sentence ends, short scraps dropped', () => {
  const chunks = chunkText(Array.from({ length: 40 }, (_, i) => sentence(i)).join(''))
  assert.ok(chunks.length >= 3)
  for (const chunk of chunks) { assert.ok(chunk.length <= 1500 && chunk.length >= 200); assert.match(chunk, /\.$/) }
  assert.deepEqual(chunkText('Too short.'), [])
})

test('examples interleave sources, cite their source, and stop at 128', () => {
  const docs = [doc('gutenberg', 1, 400), doc('wikipedia', 1, 12), doc('openalex', 1, 12)]
  const examples = buildOpenSourceExamples('solar panels', docs)
  assert.deepEqual(examples.slice(0, 3).map(e => e.sourceId), ['gutenberg', 'wikipedia', 'openalex'])
  for (const example of examples) {
    assert.match(example.prompt, /^solar panels: what (else )?does "/)
    assert.match(example.response, /\n\nSource: .+ - https:\/\/example\.org\/.+ \(CC0\)$/)
  }
  const many = buildOpenSourceExamples('t', Array.from({ length: 40 }, (_, i) => doc('openalex', i, 80)))
  assert.equal(many.length, 128)
  assert.equal(buildOpenSourceExamples('t', [{ ...doc('wikipedia', 1, 20), uri: 'javascript:alert(1)' }]).length, 0)
})

test('the output is accepted unchanged by the existing "my own examples" training path', () => {
  const docs = Array.from({ length: 8 }, (_, i) => doc(i % 2 ? 'wikipedia' : 'openalex', i, 60))
  const examples = buildOpenSourceExamples('solar panels', docs)
  const parsed = rowsFromExamples(examplesToJsonl(examples))
  assert.equal(parsed.invalidLines, 0)
  assert.equal(parsed.rows.length, examples.length)
  assert.ok(parsed.rows.length >= 20)
})

test('the route uses no keys, checks membership, and is observed', () => {
  const route = readFileSync(new URL('../app/api/lab/open-sources/route.ts', import.meta.url), 'utf8')
  assert.match(route, /itmounts_lab_customer_list_credentials/)
  assert.match(route, /observeLabRequest\('openSources\.find'/)
  assert.doesNotMatch(route, /process\.env|apiKey:\s*[^}]|openCustomerCredential/)
  // Shared cross-instance provider leases throttle every source call (and share Hugging Face's with COS).
  assert.match(route, /createSupabaseLearningSourceProviderLeasePort/)
  assert.match(route, /lease: 'huggingface_datasets'/)
  // Sources without established training rights are not wired in.
  assert.doesNotMatch(route, /OpenAlex|SemanticScholar|ArxivMetadata/)
})

test('the panel offers open sources and trains them through the examples path', () => {
  const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
  assert.match(ui, /copy\.useOpenSources/)
  assert.match(ui, /\/api\/lab\/open-sources/)
  assert.match(ui, /source: source === 'open_sources' \? 'examples' : source/)
})
