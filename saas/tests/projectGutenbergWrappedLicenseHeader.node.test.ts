// saas/tests/projectGutenbergWrappedLicenseHeader.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectGutenbergPublicDomainSearch } from '../lib/cos-core/layers/learning/publicClients.ts'

// Production 2026-09-25: real Project Gutenberg plain-text files are hard-wrapped at ~70 columns
// with CRLF line endings. The standard unrestricted sentence can therefore arrive as
// "with almost no restrictions\r\nwhatsoever". This regression uses that real shape.

const REAL_HEADER = [
  'The Project Gutenberg eBook of Mechanics: The Science of Machinery',
  '    ',
  'This ebook is for the use of anyone anywhere in the United States and',
  'most other parts of the world at no cost and with almost no restrictions',
  'whatsoever. You may copy it, give it away or re-use it under the terms',
  'of the Project Gutenberg License included with this ebook or online',
  'at www.gutenberg.org. If you are not located in the United States,',
  'you will have to check the laws of the country where you are located',
  'before using this eBook.',
  '',
  'Title: Mechanics: The Science of Machinery',
  '',
  '*** START OF THE PROJECT GUTENBERG EBOOK MECHANICS: THE SCIENCE OF MACHINERY ***',
].join('\r\n')

function realFile(body:string):string {
  return `${REAL_HEADER}\r\n${body.repeat(40)}\r\n*** END OF THE PROJECT GUTENBERG EBOOK MECHANICS: THE SCIENCE OF MACHINERY ***\r\n`
}

test('a real hard-wrapped CRLF Project Gutenberg header is recognized as unrestricted in the US', async () => {
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
      return new Response('<?xml version="1.0"?><feed></feed>', { status: 200 })
    }
    if (url.startsWith('https://openlibrary.org/search.json')) {
      return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url === 'https://www.gutenberg.org/cache/epub/49445/pg49445.txt') {
      return new Response(realFile('Mechanics machinery levers pulleys gears engines dynamics physics.\r\n'), { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('mechanics machinery', 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, 'https://www.gutenberg.org/ebooks/49445')
  assert.ok(results[0].evidence?.includes('project_gutenberg_license_header:verified_unrestricted_us'))
})

test('a wrapped restriction marker still fails closed', async () => {
  const restricted = REAL_HEADER.replace(
    'before using this eBook.',
    'before using this eBook.\r\n\r\nThis is a COPYRIGHTED Project Gutenberg\r\neBook, Details Below.',
  )

  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.startsWith('https://m.gutenberg.org/ebooks/search.opds/')) {
      return new Response('<?xml version="1.0"?><feed></feed>', { status: 200 })
    }
    if (url.startsWith('https://openlibrary.org/search.json')) {
      return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://gutendex.com/books/')) return new Response('blocked', { status: 403 })
    if (url === 'https://www.gutenberg.org/cache/epub/49445/pg49445.txt') {
      return new Response(`${restricted}\r\n${'Mechanics machinery levers pulleys gears engines.\r\n'.repeat(40)}`, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const results = await createProjectGutenbergPublicDomainSearch(fetcher)('mechanics machinery', 1)
  assert.equal(results.length, 0)
})
