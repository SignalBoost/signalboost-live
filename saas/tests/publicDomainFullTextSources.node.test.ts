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

test('Project Gutenberg falls through machine OPDS to Open Library ids and verifies rights in the ebook itself', async () => {
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
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
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
    if (url === 'https://www.gutenberg.org/cache/epub/20201/pg20201.txt') {
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
  assert.ok(calls.includes('https://www.gutenberg.org/cache/epub/20201/pg20201.txt'))
})

test('Project Gutenberg uses the machine-to-machine OPDS catalog before Gutendex', async () => {
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***\n'
    + 'Electricity magnetism induction current voltage engineering physics. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***'
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
      return new Response(`<?xml version="1.0"?><feed xmlns:dcterms="http://purl.org/dc/terms/"><entry><id>https://www.gutenberg.org/ebooks/34221</id><title>Electricity and Magnetism</title><author><name>Elisha Gray</name></author><link href="/ebooks/34221" /></entry></feed>`, {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      })
    }
    if (url === 'https://www.gutenberg.org/cache/epub/34221/pg34221.txt') {
      return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('electricity magnetism engineering', 2)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/34221')
  assert.ok(results[0].evidence?.includes('discovery:project_gutenberg_opds'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
})

test('Project Gutenberg broadens a multi-term University query when exact OPDS search returns no records', async () => {
  const calls: string[] = []
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK ASTRONOMY ***\n'
    + 'Astronomy stars planets telescope observation celestial motion science. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK ASTRONOMY ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('search.opds') && url.includes('astronomy%20scientific%20observation')) {
      return new Response('<?xml version="1.0"?><feed><entry><title>No records found.</title></entry></feed>', {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      })
    }
    if (url.includes('search.opds') && url.includes('query=astronomy')) {
      return new Response('<?xml version="1.0"?><feed><entry><id>https://www.gutenberg.org/ebooks/99991</id><title>Astronomy for Students</title><author><name>Example Astronomer</name></author><link href="/ebooks/99991" /></entry></feed>', {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      })
    }
    if (url === 'https://www.gutenberg.org/cache/epub/99991/pg99991.txt') {
      return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    if (url.startsWith('https://gutendex.com/books/')) {
      throw new Error('Gutendex should not be reached after OPDS broadening succeeds')
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('astronomy scientific observation', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/99991')
  assert.ok(results[0].evidence?.includes('discovery:project_gutenberg_opds'))
  assert.ok(results[0].evidence?.includes('discovery_query:astronomy'))
  assert.ok(calls.some(url => url.includes('astronomy%20scientific%20observation')))
  assert.ok(calls.some(url => url.includes('query=astronomy')))
  assert.ok(!calls.some(url => url.startsWith('https://gutendex.com/books/')))
})

test('Project Gutenberg cascades to the next discovery route when discovered ebooks all fail rights or mirror checks', async () => {
  const calls: string[] = []
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THIS PROJECT GUTENBERG EBOOK LAWS OF THOUGHT ***\n'
    + 'Logic reasoning probability mathematical thought algebra foundations. '.repeat(30)
    + '\n*** END OF THIS PROJECT GUTENBERG EBOOK LAWS OF THOUGHT ***'
  const restricted = 'This is a copyrighted Project Gutenberg eBook.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK RESTRICTED ***\n'
    + 'Logic material. '.repeat(80)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK RESTRICTED ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
      return new Response('<?xml version="1.0"?><feed><entry><id>https://www.gutenberg.org/ebooks/90001</id><title>Restricted Logic</title><author><name>Example</name></author><link href="/ebooks/90001" /></entry></feed>', {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      })
    }
    if (url.startsWith('https://openlibrary.org/search.json')) return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url.endsWith('/90001/pg90001.txt')) return new Response(restricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    if (url.endsWith('/15114/pg15114.txt')) return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('logic reasoning scientific method', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/15114')
  assert.ok(results[0].evidence?.includes('discovery:local_bootstrap_catalog'))
  assert.ok(results[0].evidence?.includes('acquisition_route:bootstrap'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
  assert.ok(calls.some(url => url.endsWith('/90001/pg90001.txt')))
  assert.ok(calls.some(url => url.endsWith('/15114/pg15114.txt')))
})

test('Project Gutenberg has a rights-neutral bootstrap catalog when every network discovery surface is unavailable', async () => {
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***\n'
    + 'Electricity magnetism induction current voltage engineering physics. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***'
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) return new Response('blocked', { status: 403 })
    if (url.startsWith('https://openlibrary.org/search.json')) {
      return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === 'https://www.gutenberg.org/cache/epub/34221/pg34221.txt') {
      return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('electricity magnetism engineering', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/34221')
  assert.ok(results[0].evidence?.includes('discovery:local_bootstrap_catalog'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
})

test('Project Gutenberg fallback catalog covers every rotating University book-study topic', async () => {
  const queries = [
    'algebra mathematics geometry',
    'calculus differential integral mathematics',
    'probability statistics mathematical',
    'physics mechanics dynamics',
    'electricity magnetism engineering',
    'thermodynamics heat energy physics',
    'optics light physics',
    'astronomy scientific observation',
    'logic reasoning scientific method',
    'economics political economy markets',
    'computing calculation machine logic',
    'engineering mechanics machines',
  ]
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK FALLBACK STUDY ***\n'
    + 'Foundational educational material for mathematics science engineering logic economics and study. '.repeat(30)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK FALLBACK STUDY ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) return new Response('<?xml version="1.0"?><feed></feed>', { status: 200 })
    if (url.startsWith('https://openlibrary.org/search.json')) return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url.startsWith('https://www.gutenberg.org/cache/epub/')) return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createProjectGutenbergPublicDomainSearch(fetcher)
  for (const query of queries) {
    const results = await search(query, 1)
    assert.equal(results.length, 1, `fallback catalog must yield a real ebook candidate for: ${query}`)
    assert.ok(results[0].evidence?.includes('discovery:local_bootstrap_catalog'), query)
    assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'), query)
  }
})

test('Project Gutenberg ignores generic restricted-work boilerplate after END when the ebook preamble is unrestricted', async () => {
  const unrestricted = 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever.\n'
    + 'Title: Short Optics Pamphlet\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK SHORT OPTICS PAMPHLET ***\n'
    + 'Optics light lens refraction reflection wavelength experiment physics. '.repeat(25)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK SHORT OPTICS PAMPHLET ***\n'
    + 'THE FULL PROJECT GUTENBERG LICENSE\n'
    + 'This particular work is one of the few individual works restricted by copyright law and may be included with the permission of the copyright holder.\n'

  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://gutendex.com/books/')) {
      return new Response(JSON.stringify({
        results: [{
          id: 41839,
          title: 'Short Optics Pamphlet',
          copyright: false,
          authors: [{ name: 'Example Author' }],
          formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/cache/epub/41839/pg41839.txt' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === 'https://mirror.example/gutenberg/41839/pg41839.txt') {
      return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createProjectGutenbergPublicDomainSearch(fetcher, { mirrorBaseUrl: 'https://mirror.example/gutenberg' })
  const results = await search('optics light physics', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/41839')
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
})

test('Project Gutenberg accepts official OPDS public-domain rights when fetched text has no restricted-work marker', async () => {
  const body = 'Title: On The Principles of Political Economy, and Taxation\n'
    + 'Author: David Ricardo\n'
    + '*** START OF THE PROJECT GUTENBERG EBOOK POLITICAL ECONOMY ***\n'
    + 'Political economy value rent wages profits trade taxation markets capital labor. '.repeat(35)
    + '\n*** END OF THE PROJECT GUTENBERG EBOOK POLITICAL ECONOMY ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
      return new Response(`<?xml version="1.0"?><feed><entry>
        <id>https://www.gutenberg.org/ebooks/33310</id>
        <title>On The Principles of Political Economy, and Taxation</title>
        <dcterms:rights>Public domain in the USA.</dcterms:rights>
        <author><name>David Ricardo</name></author>
        <link href="/ebooks/33310" />
      </entry></feed>`, { status: 200, headers: { 'content-type': 'application/atom+xml' } })
    }
    if (url === 'https://www.gutenberg.org/cache/epub/33310/pg33310.txt') {
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('economics political economy markets', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/33310')
  assert.ok(results[0].evidence?.includes('project_gutenberg_opds_rights:public_domain_in_usa'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_text_preamble:no_restriction_marker'))
  assert.ok(results[0].evidence?.includes('project_gutenberg_rights:verified_public_domain_us'))
})


test('Project Gutenberg rejects malformed or legacy PGLAF cache bases and falls back to official Gutenberg cache', async () => {
  const calls: string[] = []
  const unrestricted = 'The Project Gutenberg eBook of Electricity and Magnetism\n'
    + 'This eBook is for the use of anyone anywhere in the United States at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THIS PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***\n'
    + 'Electricity magnetism physics engineering science current voltage field. '.repeat(30)
    + '\n*** END OF THIS PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) return new Response('<?xml version="1.0"?><feed></feed>', { status: 200 })
    if (url.startsWith('https://openlibrary.org/search.json')) return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url === 'https://www.gutenberg.org/cache/epub/34221/pg34221.txt') return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher, {
    mirrorBaseUrl: 'https://gutenberg.pglaf.org/cache/epub}',
  })('electricity magnetism physics', 1)

  assert.equal(results.length, 1)
  assert.ok(calls.includes('https://www.gutenberg.org/cache/epub/34221/pg34221.txt'))
  assert.ok(!calls.some(url => /pglaf\.org|%7D|%7B/i.test(url)))
})

test('Project Gutenberg rejects the legacy PGLAF cache/epub base even when it is syntactically valid', async () => {
  const calls: string[] = []
  const unrestricted = 'The Project Gutenberg eBook of Electricity and Magnetism\n'
    + 'This eBook is for the use of anyone anywhere in the United States at no cost and with almost no restrictions whatsoever.\n'
    + '*** START OF THIS PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***\n'
    + 'Electricity magnetism physics engineering science current voltage field. '.repeat(30)
    + '\n*** END OF THIS PROJECT GUTENBERG EBOOK ELECTRICITY AND MAGNETISM ***'

  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) return new Response('<?xml version="1.0"?><feed></feed>', { status: 200 })
    if (url.startsWith('https://openlibrary.org/search.json')) return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url === 'https://www.gutenberg.org/cache/epub/34221/pg34221.txt') return new Response(unrestricted, { status: 200, headers: { 'content-type': 'text/plain' } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher, {
    mirrorBaseUrl: 'https://gutenberg.pglaf.org/cache/epub',
  })('electricity magnetism physics', 1)

  assert.equal(results.length, 1)
  assert.ok(calls.includes('https://www.gutenberg.org/cache/epub/34221/pg34221.txt'))
  assert.ok(!calls.some(url => url.startsWith('https://gutenberg.pglaf.org/cache/epub/')))
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
