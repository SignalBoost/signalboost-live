import test from 'node:test'
import assert from 'node:assert/strict'
import { freshEvidenceSearchQueries, freshEvidenceMeetsAuthority, freshEvidenceGroundingBlock } from '../lib/ai/cos/cosFreshGrounding.ts'

test('Portuguese next president question retrieves electoral results and independent polling', () => {
  const question = 'quem sera o proximo presidente do Brasil?'
  const queries = freshEvidenceSearchQueries(question, new Date('2026-10-10T12:00:00Z'))
  assert.ok(queries.some(query => query.includes('tse.jus.br') && query.includes('2026')))
  assert.ok(queries.some(query => query.includes('pesquisa eleitoral')))
  assert.ok(queries.some(query => query.includes('segundo turno')))
})

test('electoral verification permits TSE or independent hosts, not one press report', () => {
  const question = 'quem sera o proximo presidente do Brasil?'
  const source = (url: string) => ({ id: url, title: 'Election', url, snippet: 'Resultados', sourceDate: '2026-10-10' })
  assert.equal(freshEvidenceMeetsAuthority(question, [source('https://news.example/a') ] as any), false)
  assert.equal(freshEvidenceMeetsAuthority(question, [source('https://news.example/a'), source('https://other.example/b')] as any), true)
  assert.equal(freshEvidenceMeetsAuthority(question, [source('https://www.tse.jus.br/eleicoes/resultados')] as any), true)
})

test('electoral synthesis is explicitly instructed not to predict a winner', () => {
  const prompt = 'quem sera o proximo presidente do Brasil?'
  const grounding = freshEvidenceGroundingBlock(prompt, [], '2026-10-10T12:00:00Z')
  assert.match(grounding, /Never convert a poll lead into a predicted winner/)
})

test('English Brazilian next president question receives official electoral query plan', () => {
  const queries = freshEvidenceSearchQueries('who will be the next brazilian president?', new Date('2026-10-10T12:00:00Z'))
  assert.ok(queries.some(query => query.includes('tse.jus.br') && query.includes('2026')))
  assert.ok(queries.some(query => query.includes('pesquisa eleitoral')))
})

test('future-election fallback recognizes nationality between next and president', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
  const expression = source.match(/const asksUndecidedElectionOutcome = (\/.*?\/iu)\.test\(input\.prompt\)/)
  assert.ok(expression, 'future election guard must exist')
  const regex = new RegExp(expression[1].slice(1, -3), 'iu')
  assert.equal(regex.test('who will be the next brazilian president?'), true)
  assert.equal(regex.test('who will be the next president of Brazil?'), true)
  assert.equal(regex.test('quem sera o proximo presidente do Brasil?'), true)
  assert.equal(regex.test('Who is the current president of Brazil?'), false)
})
