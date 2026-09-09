import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  assessWebTrainingSource,
  buildWebTrainingResearchQuery,
  createWebTrainingResearchSearch,
  isSafePublicWebTrainingUrl,
  webTrainingMinimumCredibility,
} from '../lib/cos-core/layers/learning/webTrainingDataLayer.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('Web Data Layer rejects private and low-signal locations before training acquisition', () => {
  assert.equal(isSafePublicWebTrainingUrl('http://127.0.0.1/admin'), false)
  assert.equal(isSafePublicWebTrainingUrl('http://192.168.1.20/internal'), false)
  assert.equal(isSafePublicWebTrainingUrl('http://localhost:3000'), false)
  assert.equal(isSafePublicWebTrainingUrl('https://www.nist.gov/cyberframework'), true)

  const low = assessWebTrainingSource('https://medium.com/example/security-opinion', 'enterprise cybersecurity')
  assert.equal(low.sourceClass, 'low_signal')
  assert.ok(low.credibility < webTrainingMinimumCredibility())
})

test('Web Data Layer structurally prefers owning, institutional, standards, and scholarly sources', () => {
  const standards = assessWebTrainingSource('https://www.nist.gov/cyberframework', 'NIST cybersecurity framework controls')
  const institutional = assessWebTrainingSource('https://cs.stanford.edu/research', 'computer science distributed systems research')
  const scholarly = assessWebTrainingSource('https://arxiv.org/abs/2601.12345', 'AI agent evaluation research')
  const owner = assessWebTrainingSource('https://kubernetes.io/docs/concepts/security/', 'Kubernetes security architecture')
  const tertiary = assessWebTrainingSource('https://en.wikipedia.org/wiki/Kubernetes', 'Kubernetes security architecture')

  assert.equal(standards.sourceClass, 'standards_authority')
  assert.ok(standards.credibility >= 0.95)
  assert.equal(institutional.sourceClass, 'institutional')
  assert.ok(institutional.credibility >= 0.95)
  assert.equal(scholarly.sourceClass, 'scholarly')
  assert.ok(scholarly.credibility >= 0.9)
  assert.equal(owner.sourceClass, 'owning_authority')
  assert.ok(owner.credibility >= 0.9)
  assert.equal(tertiary.sourceClass, 'tertiary_reference')
  assert.ok(tertiary.credibility < webTrainingMinimumCredibility())
})

test('training research queries are bounded and explicitly seek authoritative evidence', () => {
  const query = buildWebTrainingResearchQuery('Kubernetes multi tenant workload isolation and admission control behavior in modern production clusters')
  assert.ok(query.length <= 380)
  assert.match(query, /Kubernetes/i)
  assert.match(query, /authoritative/i)
  assert.match(query, /primary/i)
  assert.match(query, /official/i)
  assert.match(query, /university/i)
  assert.match(query, /research/i)
})

test('credible web research reads diverse high-quality pages and never fetches rejected result pages', async () => {
  const pageFetches: string[] = []
  const longNist = `${'Kubernetes security control evidence and least privilege guidance. '.repeat(30)} NIST institutional guidance.`
  const longKubernetes = `${'Kubernetes documentation explains admission control, namespaces, policy and workload isolation. '.repeat(30)} Official project documentation.`
  const discoveryHtml = [
    '<html><body>',
    '<a class="result__a" href="https://www.nist.gov/example/kubernetes-security">NIST Kubernetes guidance</a>',
    '<a class="result__a" href="https://medium.com/example/kubernetes-opinion">A personal Kubernetes opinion</a>',
    '<a class="result__a" href="https://kubernetes.io/docs/concepts/security/">Kubernetes security documentation</a>',
    '<a class="result__a" href="https://www.nist.gov/example/duplicate-host">Another NIST result</a>',
    '</body></html>',
  ].join('')

  const fetcher: typeof fetch = async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://html.duckduckgo.com/html/')) {
      return new Response(discoveryHtml, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    pageFetches.push(url)
    if (url.includes('nist.gov')) {
      return new Response(`<main><h1>NIST</h1><p>${longNist}</p></main>`, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.includes('kubernetes.io')) {
      return new Response(`<main><h1>Kubernetes</h1><p>${longKubernetes}</p></main>`, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.includes('medium.com')) {
      throw new Error('low-signal page must never be fetched')
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }

  const search = createWebTrainingResearchSearch({ fetcher, minCredibility: 0.82, maxDiscoveryResults: 8 })
  const results = await search('Kubernetes security admission control workload isolation', 3)

  assert.equal(results.length, 2)
  assert.deepEqual(new Set(results.map(result => new URL(result.uri).hostname)).size, 2)
  assert.ok(results.some(result => result.uri.includes('nist.gov')))
  assert.ok(results.some(result => result.uri.includes('kubernetes.io')))
  assert.equal(pageFetches.some(url => url.includes('medium.com')), false)
  assert.equal(pageFetches.filter(url => url.includes('nist.gov')).length, 1)
  for (const result of results) {
    assert.ok(result.text.length >= 700)
    assert.ok(result.evidence?.includes('web_data_layer=credible_training_research_v1'))
    assert.ok(result.evidence?.some(item => item.startsWith('source_credibility=')))
    assert.match(String(result.license), /facts_and_summary_only/)
  }
})

test('production bindings make credible web research an additional governed adapter, not a second learning engine', () => {
  const liveSources = file('lib/cos-core/layers/learning/liveSources.ts')
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')
  const skills = file('../SKILLS.md')

  assert.match(liveSources, /createWebTrainingResearchSearch/)
  assert.match(liveSources, /COS_WEB_TRAINING_ENABLED/)
  assert.match(liveSources, /COS_WEB_TRAINING_USE_BRAVE/)
  assert.match(liveSources, /id='credible_web'|['"]credible_web['"]/)
  assert.match(cycle, /ContinuousLearningDirector/)
  assert.match(skills, /locate or request high-quality material through governed acquisition paths/i)
})
