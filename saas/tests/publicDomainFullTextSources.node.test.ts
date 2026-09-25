import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createEuropePmcScientificSearch,
  createProjectGutenbergPublicDomainSearch,
} from '../lib/cos-core/layers/learning/publicClients.ts'

test('Project Gutenberg adapter fetches only explicit public-domain HTTPS Gutenberg full text', async () => {
  const calls: string[] = []
  const body = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n'
    + 'Mathematics geometry algebra proof theorem calculation scientific method. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://gutendex.com/books/')) {
      return new Response(JSON.stringify({
        results: [
          {
            id: 101,
            title: 'Public Domain Mathematics',
            copyright: false,
            authors: [{ name: 'Example, Ada' }],
            formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/101/101-0.txt' },
          },
          {
            id: 102,
            title: 'Copyrighted Work',
            copyright: true,
            formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/102/102-0.txt' },
          },
          {
            id: 103,
            title: 'Untrusted Text Host',
            copyright: false,
            formats: { 'text/plain; charset=utf-8': 'https://example.com/book.txt' },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === 'https://mirror.example/gutenberg/101/pg101.txt') {
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createProjectGutenbergPublicDomainSearch(fetcher, { mirrorBaseUrl: 'https://mirror.example/gutenberg' })
  const results = await search('mathematics geometry', 3)

  assert.equal(results.length, 1)
  assert.equal(results[0].license, 'public domain')
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/101')
  assert.ok(results[0].text.length >= 900)
  assert.match(results[0].text, /geometry algebra proof theorem/)
  assert.ok(results[0].evidence?.includes('gutendex_copyright:false'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
  assert.ok(calls.includes('https://mirror.example/gutenberg/101/pg101.txt'))
  assert.ok(!calls.some(url => url.startsWith('https://www.gutenberg.org/files/')))
  assert.ok(!calls.includes('https://example.com/book.txt'))
})

test('Project Gutenberg falls back from Gutendex cloud 403 to Open Library ids and verifies rights in the ebook itself', async () => {
  const calls: string[] = []
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK FALLBACK ***\n'
    + 'Electricity magnetism induction engineering field current voltage. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK FALLBACK ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://gutendex.com/books/')) {
      return new Response('blocked', { status: 403 })
    }
    if (url.startsWith('https://openlibrary.org/search.json')) {
      return new Response(JSON.stringify({
        docs: [{
          key: '/works/OL1W',
          title: 'Electricity and Magnetism',
          author_name: ['Example Scientist'],
          id_project_gutenberg: ['20201'],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === 'https://gutenberg.pglaf.org/cache/epub/20201/pg20201.txt') {
      return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createProjectGutenbergPublicDomainSearch(fetcher)
  const results = await search('electricity magnetism engineering', 2)

  assert.equal(results.length, 1)
  assert.equal(results[0].license, 'public domain')
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/20201')
  assert.ok(results[0].evidence?.includes('discovery:open_library_project_gutenberg_id'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
  assert.ok(calls.some(url => url.startsWith('https://openlibrary.org/search.json')))
  assert.ok(calls.includes('https://gutenberg.pglaf.org/cache/epub/20201/pg20201.txt'))
})

test('Project Gutenberg never upgrades a restricted ebook to training rights even when discovery points to it', async () => {
  const restricted = 'This particular work is one of the few individual works restricted by copyright law in the United States.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK RESTRICTED ***\n'
    + 'Useful technical content. '.repeat(60)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK RESTRICTED ***'
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://gutendex.com/books/')) {
      return new Response(JSON.stringify({
        results: [{
          id: 30303,
          title: 'Restricted Example',
          copyright: false,
          authors: [{ name: 'Example Author' }],
          formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/30303/30303-0.txt' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/30303/pg30303.txt')) return new Response(restricted, { status: 200 })
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createProjectGutenbergPublicDomainSearch(fetcher, { mirrorBaseUrl: 'https://mirror.example/gutenberg' })
  const results = await search('technical', 1)
  assert.equal(results.length, 0)
})

test('Europe PMC only upgrades explicit CC0/public-domain full text to mass-distillation rights', async () => {
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.includes('/search?')) {
      return new Response(JSON.stringify({
        resultList: {
          result: [{
            pmcid: 'PMC7654321',
            title: 'Open scientific evidence',
            abstractText: 'Scientific evidence abstract.',
            isOpenAccess: 'Y',
            license: 'CC0 1.0',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/PMC7654321/fullTextXML')) {
      return new Response(`<article><body><p>${'scientific method statistics probability evidence experiment '.repeat(35)}</p></body></article>`, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createEuropePmcScientificSearch(fetcher)('statistics scientific method', 1)
  assert.equal(results.length, 1)
  assert.match(String(results[0].license), /^cc0/i)
  assert.ok(results[0].evidence?.includes('training_rights:explicit_cc0_or_public_domain'))
})

test('public-domain full-text source is wired into continuity, working-agent retrieval, telemetry and distillation-safe docs', () => {
  const live = readFileSync(new URL('../lib/cos-core/layers/learning/liveSources.ts', import.meta.url), 'utf8')
  const daily = readFileSync(new URL('../lib/cos/dailyAutonomousLearning.ts', import.meta.url), 'utf8')
  const continuity = readFileSync(new URL('../lib/cos/openSourceContinuityLearning.ts', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('../lib/ai/cos/workingAgentKnowledge.ts', import.meta.url), 'utf8')
  const telemetry = readFileSync(new URL('../app/api/admin/cos-university-telemetry/route.ts', import.meta.url), 'utf8')
  const onboard = readFileSync(new URL('../../ONBOARD.md', import.meta.url), 'utf8')

  assert.match(live, /createProjectGutenbergPublicDomainSearch/)
  assert.match(live, /project_gutenberg_pd/)
  assert.match(daily, /projectGutenbergFullTextCurriculum/)
  assert.match(daily, /training_rights:public_domain/)
  assert.match(continuity, /project_gutenberg_pd/)
  assert.match(continuity, /library_material/)
  assert.match(bridge, /gutenberg\\\.org/)
  assert.match(telemetry, /Project Gutenberg full text/)
  assert.match(telemetry, /project_gutenberg/)
  assert.match(onboard, /Project Gutenberg public-domain full-text lane/)
  assert.match(onboard, /mass-distillation rights gate/)
})
