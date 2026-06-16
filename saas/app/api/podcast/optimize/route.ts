import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getCurrentUser } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"')
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
function tagContent(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'))
  return m ? decode(m[1]).trim() : null
}
function tagAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp('<' + tag + '\\b[^>]*?\\b' + attr + '\\s*=\\s*["\']([^"\']*)["\']', 'i'))
  return m ? decode(m[1]).trim() : null
}
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (h === '0.0.0.0' || h === '::1') return true
  return false
}

async function fetchText(url: string, accept: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SignalBoostBot/1.0 (+podcast audit)', Accept: accept },
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = (await res.text()).slice(0, 2_000_000)
    return { status: res.status, text, finalUrl: res.url || url }
  } finally {
    clearTimeout(timer)
  }
}

// Resolve an Apple Podcasts link to its RSS feed via the iTunes lookup API.
async function resolveAppleFeed(url: string): Promise<string | null> {
  const m = url.match(/id(\d+)/)
  if (!m) return null
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${m[1]}&entity=podcast`, {
      headers: { 'User-Agent': 'SignalBoostBot/1.0' },
    })
    const data = await res.json()
    return data?.results?.[0]?.feedUrl || null
  } catch {
    return null
  }
}

function runChecks(xml: string) {
  const firstItem = xml.search(/<item[\s>]/i)
  const channel = firstItem >= 0 ? xml.slice(0, firstItem) : xml
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  const checks: Check[] = []

  const showTitle = tagContent(channel, 'title') || ''
  const epCount = items.length

  // ── Discoverability / Apple requirements ──
  checks.push(showTitle
    ? { id: 'title', label: 'Show title', category: 'Discoverability', status: 'pass', detail: `“${showTitle}”`, recommendation: '' }
    : { id: 'title', label: 'Show title', category: 'Discoverability', status: 'fail', detail: 'No channel <title>.', recommendation: 'Add a clear, searchable show title.' })

  const summary = tagContent(channel, 'itunes:summary') || tagContent(channel, 'description') || ''
  const sumLen = stripTags(summary).length
  if (sumLen === 0) checks.push({ id: 'desc', label: 'Show description', category: 'Discoverability', status: 'fail', detail: 'No show description/summary.', recommendation: 'Add a compelling description with keywords listeners search for.' })
  else if (sumLen < 100) checks.push({ id: 'desc', label: 'Show description', category: 'Discoverability', status: 'warn', detail: `Description is only ${sumLen} characters.`, recommendation: 'Expand to a few sentences covering topic, audience, and value.' })
  else checks.push({ id: 'desc', label: 'Show description', category: 'Discoverability', status: 'pass', detail: 'Present and substantive.', recommendation: '' })

  const artwork = tagAttr(channel, 'itunes:image', 'href')
  checks.push(artwork
    ? { id: 'artwork', label: 'Cover artwork', category: 'Discoverability', status: 'pass', detail: 'itunes:image is set.', recommendation: '' }
    : { id: 'artwork', label: 'Cover artwork', category: 'Discoverability', status: 'fail', detail: 'No itunes:image artwork.', recommendation: 'Add square cover art (1400–3000px, JPG/PNG). Apple rejects feeds without it.' })

  const category = tagAttr(channel, 'itunes:category', 'text')
  checks.push(category
    ? { id: 'category', label: 'Apple category', category: 'Discoverability', status: 'pass', detail: `Primary category: ${category}.`, recommendation: '' }
    : { id: 'category', label: 'Apple category', category: 'Discoverability', status: 'fail', detail: 'No itunes:category.', recommendation: 'Set at least one valid Apple Podcasts category for discovery.' })

  const author = tagContent(channel, 'itunes:author')
  checks.push(author
    ? { id: 'author', label: 'Author / host', category: 'Discoverability', status: 'pass', detail: `Author: ${author}.`, recommendation: '' }
    : { id: 'author', label: 'Author / host', category: 'Discoverability', status: 'warn', detail: 'No itunes:author.', recommendation: 'Add the host/brand name as itunes:author.' })

  const ownerEmail = tagContent(channel, 'itunes:email') || (channel.match(/<itunes:owner>[\s\S]*?<itunes:email>([\s\S]*?)<\/itunes:email>/i)?.[1] || '').trim()
  checks.push(ownerEmail
    ? { id: 'owner', label: 'Owner email (verification)', category: 'Discoverability', status: 'pass', detail: 'Owner email present.', recommendation: '' }
    : { id: 'owner', label: 'Owner email (verification)', category: 'Discoverability', status: 'warn', detail: 'No itunes:owner email.', recommendation: 'Add an owner email — required to claim the show on Apple/Spotify.' })

  const language = tagContent(channel, 'language')
  checks.push(language
    ? { id: 'language', label: 'Language', category: 'Discoverability', status: 'pass', detail: `Language: ${language}.`, recommendation: '' }
    : { id: 'language', label: 'Language', category: 'Discoverability', status: 'warn', detail: 'No <language> tag.', recommendation: 'Declare the feed language (e.g. en-us) for correct catalog placement.' })

  const explicit = tagContent(channel, 'itunes:explicit')
  checks.push(explicit !== null
    ? { id: 'explicit', label: 'Explicit rating', category: 'Discoverability', status: 'pass', detail: `Set to “${explicit}”.`, recommendation: '' }
    : { id: 'explicit', label: 'Explicit rating', category: 'Discoverability', status: 'warn', detail: 'No itunes:explicit tag.', recommendation: 'Set itunes:explicit (true/false) — some platforms require it.' })

  // ── Episode quality ──
  if (epCount === 0) {
    checks.push({ id: 'episodes', label: 'Episodes', category: 'Episode quality', status: 'fail', detail: 'No <item> episodes found.', recommendation: 'Publish at least one episode; some directories need 1–3 to list the show.' })
  } else {
    checks.push({ id: 'episodes', label: 'Episodes', category: 'Episode quality', status: 'pass', detail: `${epCount} episodes in the feed.`, recommendation: '' })

    const withAudio = items.filter(i => /<enclosure\b[^>]*\burl\s*=/i.test(i)).length
    const audioPct = Math.round((withAudio / epCount) * 100)
    checks.push(audioPct === 100
      ? { id: 'audio', label: 'Audio files', category: 'Episode quality', status: 'pass', detail: 'Every episode has an audio enclosure.', recommendation: '' }
      : { id: 'audio', label: 'Audio files', category: 'Episode quality', status: 'fail', detail: `${audioPct}% of episodes have an <enclosure> audio file.`, recommendation: 'Every episode needs a valid <enclosure> audio URL or it won’t play.' })

    const withDur = items.filter(i => /<itunes:duration[\s>]/i.test(i)).length
    const durPct = Math.round((withDur / epCount) * 100)
    checks.push(durPct >= 90
      ? { id: 'duration', label: 'Episode durations', category: 'Episode quality', status: 'pass', detail: `${durPct}% include itunes:duration.`, recommendation: '' }
      : { id: 'duration', label: 'Episode durations', category: 'Episode quality', status: 'warn', detail: `Only ${durPct}% include itunes:duration.`, recommendation: 'Add itunes:duration so players show length and remaining time.' })

    const notesOk = items.filter(i => {
      const d = tagContent(i, 'content:encoded') || tagContent(i, 'description') || tagContent(i, 'itunes:summary') || ''
      return stripTags(d).length >= 200
    }).length
    const notesPct = Math.round((notesOk / epCount) * 100)
    checks.push(notesPct >= 70
      ? { id: 'notes', label: 'Show notes', category: 'Episode quality', status: 'pass', detail: `${notesPct}% of episodes have solid show notes.`, recommendation: '' }
      : { id: 'notes', label: 'Show notes', category: 'Episode quality', status: 'warn', detail: `Only ${notesPct}% have show notes ≥200 chars.`, recommendation: 'Write fuller show notes — they drive SEO and listener context.' })

    const withGuid = items.filter(i => /<guid[\s>]/i.test(i)).length
    const guidPct = Math.round((withGuid / epCount) * 100)
    checks.push(guidPct === 100
      ? { id: 'guid', label: 'Episode GUIDs', category: 'Episode quality', status: 'pass', detail: 'All episodes have a stable GUID.', recommendation: '' }
      : { id: 'guid', label: 'Episode GUIDs', category: 'Episode quality', status: 'warn', detail: `${guidPct}% of episodes have a <guid>.`, recommendation: 'Give every episode a unique, permanent GUID to avoid duplicates.' })
  }

  // ── Growth ──
  const link = tagContent(channel, 'link')
  checks.push(link
    ? { id: 'website', label: 'Show website', category: 'Growth', status: 'pass', detail: 'Channel <link> present.', recommendation: '' }
    : { id: 'website', label: 'Show website', category: 'Growth', status: 'warn', detail: 'No channel <link>.', recommendation: 'Link a show website to capture listeners and email signups.' })

  const transcripts = items.filter(i => /<podcast:transcript\b/i.test(i)).length
  if (epCount > 0) {
    const tPct = Math.round((transcripts / epCount) * 100)
    checks.push(tPct >= 50
      ? { id: 'transcripts', label: 'Transcripts', category: 'Growth', status: 'pass', detail: `${tPct}% of episodes include a transcript.`, recommendation: '' }
      : { id: 'transcripts', label: 'Transcripts', category: 'Growth', status: 'warn', detail: `Only ${tPct}% include a <podcast:transcript>.`, recommendation: 'Add transcripts (podcast namespace) for accessibility and search.' })
  }

  // Publishing recency
  const times = items
    .map(i => tagContent(i, 'pubDate'))
    .filter(Boolean)
    .map(d => new Date(d as string).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => b - a)
  if (times.length > 0) {
    const daysSince = Math.round((Date.now() - times[0]) / 86400000)
    checks.push(daysSince <= 45
      ? { id: 'recency', label: 'Publishing activity', category: 'Growth', status: 'pass', detail: `Latest episode ${daysSince} days ago.`, recommendation: '' }
      : { id: 'recency', label: 'Publishing activity', category: 'Growth', status: 'warn', detail: `Latest episode was ${daysSince} days ago.`, recommendation: 'A consistent cadence helps growth and retention — keep shipping.' })
  }

  return { checks, showTitle, epCount }
}

function scoreOf(checks: Check[]): number {
  const val = (s: Status) => (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0)
  const total = checks.length || 1
  return Math.round((checks.reduce((a, c) => a + val(c.status), 0) / total) * 100)
}
function deterministicSummary(checks: Check[], score: number): string {
  const issues = checks.filter(c => c.status !== 'pass')
  if (issues.length === 0) return `Excellent — your feed passed all ${checks.length} checks (score ${score}/100). Keep your cadence and show notes strong.`
  const top = issues.slice(0, 5).map((c, i) => `${i + 1}. ${c.label}: ${c.recommendation}`)
  return `Overall score: ${score}/100. Top priorities:\n${top.join('\n')}`
}
async function aiSummary(checks: Check[], score: number, show: string, language: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const findings = checks.map(c => `- [${c.status.toUpperCase()}] ${c.category} · ${c.label}: ${c.detail}${c.recommendation ? ' → ' + c.recommendation : ''}`).join('\n')
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: `You are a podcast growth expert. Reply strictly in ${language}. Given feed audit findings, write a short, practical action plan: a one-line verdict, then 3–6 prioritized fixes in plain language. Be concrete and encouraging.` },
        { role: 'user', content: `Show: ${show || '(untitled)'}\nScore: ${score}/100\nFindings:\n${findings}` },
      ],
    })
    return res.choices[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const authedUser = await getCurrentUser()
  if (!authedUser) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  let raw = String(body?.url || '').trim()
  if (!raw) return NextResponse.json({ error: 'Please enter your podcast RSS feed (or Apple Podcasts link).' }, { status: 400 })
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw

  let parsed: URL
  try { parsed = new URL(raw) } catch { return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 }) }
  if (!/^https?:$/.test(parsed.protocol)) return NextResponse.json({ error: 'Only http and https URLs are supported.' }, { status: 400 })
  if (isPrivateHost(parsed.hostname)) return NextResponse.json({ error: 'That host is not allowed.' }, { status: 400 })

  const language = String(body?.language || 'en')

  // If it's an Apple Podcasts link, resolve to the real RSS feed.
  let feedUrl = parsed.toString()
  if (/apple\.com/i.test(parsed.hostname)) {
    const resolved = await resolveAppleFeed(feedUrl)
    if (!resolved) return NextResponse.json({ error: 'Could not find an RSS feed for that Apple Podcasts link. Paste the RSS feed URL directly.' }, { status: 400 })
    feedUrl = resolved
  }

  let page
  try {
    page = await fetchText(feedUrl, 'application/rss+xml, application/xml, text/xml')
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'The feed took too long to respond.' : 'Could not reach that feed URL.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
  if (page.status >= 400) return NextResponse.json({ error: `The feed returned HTTP ${page.status}.` }, { status: 502 })
  if (!/<rss[\s>]|<feed[\s>]|<channel[\s>]/i.test(page.text)) {
    return NextResponse.json({ error: 'That URL did not return a podcast RSS feed. Check the feed address.' }, { status: 400 })
  }

  const { checks, showTitle, epCount } = runChecks(page.text)
  const score = scoreOf(checks)
  const ai = await aiSummary(checks, score, showTitle, language)
  const summary = ai || deterministicSummary(checks, score)

  return NextResponse.json({
    url: raw,
    feedUrl,
    show: showTitle,
    episodes: epCount,
    score,
    checks,
    summary,
    source: ai ? 'openai' : 'deterministic',
  })
}
