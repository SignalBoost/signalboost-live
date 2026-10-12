// saas/app/api/lab/open-sources/route.ts
// Free training material for the customer LAB. POST { organizationId, topic, sources: LabOpenSourceId[] }
//   -> { ok, count, jsonl (one {"prompt","response"} per line), perSource: { <id>: number | 'unavailable' } }
// Reads public open sources only (no keys: neither the customer's nor the platform's), never pays an AI model,
// never stores anything. The examples are returned for the person to review; training uses the existing
// "my own examples" path, so spend rules are unchanged.
import { NextRequest, NextResponse } from 'next/server'
import { observeLabRequest } from '@/lib/lab/observability'
import { customerSession, rpcErrorCode, UUID_RE } from '@/lib/lab/customerSession'
import {
  LAB_OPEN_SOURCES, buildOpenSourceExamples, cleanTopic, examplesToJsonl, isLabOpenSourceId,
  type LabOpenSourceId, type OpenSourceDocument,
} from '@/lib/lab/labOpenSources'
import type { LearningConnectorSearch } from '@/lib/cos-core/layers/learning/connectors'
import { createWikipediaSearch } from '@/lib/cos-core/layers/learning/referenceClients'
import { createOpenAlexScientificSearch, createProjectGutenbergPublicDomainSearch } from '@/lib/cos-core/layers/learning/publicClients'
import { createSemanticScholarScientificSearch } from '@/lib/cos-core/layers/learning/semanticResearch'
import { createHuggingFaceArxivMetadataSearch } from '@/lib/cos-core/layers/learning/huggingFaceOpenData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const noStore = { 'cache-control': 'no-store' }
const SOURCE_TIMEOUT_MS = 25_000

// Each source is searched with its public, keyless client (the same connectors COS University uses).
const SEARCHES: Readonly<Record<LabOpenSourceId, readonly LearningConnectorSearch[]>> = {
  huggingface_datasets: [createHuggingFaceArxivMetadataSearch()],
  openalex: [createOpenAlexScientificSearch({ page: 1 }), createOpenAlexScientificSearch({ page: 2 })],
  gutenberg: [createProjectGutenbergPublicDomainSearch()],
  semantic_scholar: [createSemanticScholarScientificSearch({})],
  wikipedia: [createWikipediaSearch()],
}

async function fetchSource(id: LabOpenSourceId, topic: string): Promise<OpenSourceDocument[]> {
  const pages = await Promise.all(SEARCHES[id].map(search => search(topic, 10)))
  return pages.flat().map(item => ({
    sourceId: id, uri: String(item.uri ?? ''), title: String(item.title ?? '').trim(), text: String(item.text ?? ''), license: String(item.license ?? ''),
  }))
}

const withTimeout = <T,>(work: Promise<T>) => Promise.race([
  work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), SOURCE_TIMEOUT_MS)),
])

async function postHandler(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const body = await req.json().catch(() => null)
  const organizationId = String(body?.organizationId ?? '')
  const topic = cleanTopic(body?.topic)
  const requested: unknown[] = Array.isArray(body?.sources) ? body.sources : []
  const sources = LAB_OPEN_SOURCES.map(item => item.id).filter(id => requested.includes(id))
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ ok: false, error: 'lab_organization_required' }, { status: 400, headers: noStore })
  if (topic.length < 3) return NextResponse.json({ ok: false, error: 'lab_open_sources_topic_invalid' }, { status: 400, headers: noStore })
  if (!sources.length || !requested.every(isLabOpenSourceId)) return NextResponse.json({ ok: false, error: 'lab_open_sources_none_selected' }, { status: 400, headers: noStore })
  // Members only, so this route is not an open proxy to public sources.
  const member = await session.supabase.rpc('itmounts_lab_customer_list_credentials', { p_organization_id: organizationId })
  if (member.error) return NextResponse.json({ ok: false, error: rpcErrorCode(member.error) }, { status: 403, headers: noStore })

  const settled = await Promise.allSettled(sources.map(id => withTimeout(fetchSource(id, topic))))
  const documents: OpenSourceDocument[] = []
  const perSource: Record<string, number | 'unavailable'> = {}
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') documents.push(...result.value)
    else perSource[sources[index]] = 'unavailable'
  })
  const examples = buildOpenSourceExamples(topic, documents)
  for (const id of sources) if (perSource[id] !== 'unavailable') perSource[id] = examples.filter(example => example.sourceId === id).length
  if (sources.every(id => perSource[id] === 'unavailable')) {
    return NextResponse.json({ ok: false, error: 'lab_open_sources_unavailable', perSource }, { status: 502, headers: noStore })
  }
  return NextResponse.json({
    ok: true, perSource, count: examples.length, jsonl: examplesToJsonl(examples),
  }, { headers: noStore })
}

export async function POST(req: NextRequest) {
  return observeLabRequest('openSources.find', () => postHandler(req))
}
