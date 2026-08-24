import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordedSourceForProvenance } from './responseLineage.ts'

export type RecordedTurnProvenance = Record<string, unknown>

const MAX_STORED_CONTENT = 4000

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalize(value: unknown): RecordedTurnProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const json = JSON.stringify(value)
    if (!json || json.length > 32_000) return null
    return JSON.parse(json) as RecordedTurnProvenance
  } catch {
    return null
  }
}

function canonicalAssistantContent(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    // Rendering/copy surfaces can turn Markdown headings into bold text or vice versa.
    // Provenance is bound to the textual answer, not presentation-only Markdown tokens.
    .replace(/^\s{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

export function normalizeAssistantContent(value: unknown): string {
  return canonicalAssistantContent(value).slice(0, MAX_STORED_CONTENT)
}

export function assistantContentMatchesForProvenance(storedValue: unknown, expectedValue: unknown): boolean {
  const stored = canonicalAssistantContent(storedValue)
  const expected = canonicalAssistantContent(expectedValue)
  if (!stored || !expected) return false
  if (stored === expected) return true

  // cos_latest_turn_provenance intentionally stores at most 4,000 characters. Older rows were
  // truncated before presentation-token canonicalization, so after stripping Markdown they can be
  // slightly shorter than the same fully rendered answer. Treat the truncated canonical text as a
  // prefix only when the stored/raw side actually reached the storage ceiling.
  const storedWasTruncated = String(storedValue ?? '').length >= MAX_STORED_CONTENT
  const expectedWasTruncated = String(expectedValue ?? '').length >= MAX_STORED_CONTENT
  if (storedWasTruncated && expected.startsWith(stored)) return true
  if (expectedWasTruncated && stored.startsWith(expected)) return true
  return false
}

export async function latestRecordedTurnProvenance(conversationId: string,userId: string): Promise<RecordedTurnProvenance | null> {
  if (!validId(conversationId) || !userId) return null
  const db = cosServiceDb(); if (!db) return null
  try {
    const { data, error } = await db.from('assistant_messages').select('provenance').eq('conversation_id', conversationId).eq('user_id', userId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return normalize(data?.provenance)
  } catch (error) {
    console.error('supportTurnProvenance: latest provenance read failed', error)
    return null
  }
}

export async function recordedTurnProvenanceByContent(userId: string,assistantContent: string): Promise<RecordedTurnProvenance | null> {
  if (!userId) return null
  const expected = normalizeAssistantContent(assistantContent); if (!expected) return null
  const db = cosServiceDb(); if (!db) return null
  try {
    const { data, error } = await db.from('assistant_messages').select('provenance,content').eq('user_id', userId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    const row = (data ?? []).find((item: any) => assistantContentMatchesForProvenance(item?.content, assistantContent))
    return normalize(row?.provenance)
  } catch (error) {
    console.error('supportTurnProvenance: content provenance read failed', error)
    return null
  }
}

export async function recordLatestUserTurnProvenance(userId:string,assistantContent:string,provenance:unknown,source?:string):Promise<boolean>{
  if(!userId)return false
  const normalized=normalize(provenance); const content=normalizeAssistantContent(assistantContent)
  if(!normalized||!content)return false
  const db=cosServiceDb(); if(!db)return false
  const recordedSource=recordedSourceForProvenance(source,normalized)
  try{
    const {error}=await db.from('cos_latest_turn_provenance').upsert({user_id:userId,assistant_content:content,provenance:normalized,source:recordedSource,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    if(error)throw error
    return true
  }catch(error){console.error('supportTurnProvenance: latest-user provenance write failed',error);return false}
}

export async function latestUserTurnProvenance(userId:string,expectedAssistantContent?:string):Promise<RecordedTurnProvenance|null>{
  if(!userId)return null
  const db=cosServiceDb(); if(!db)return null
  try{
    const {data,error}=await db.from('cos_latest_turn_provenance').select('assistant_content,provenance').eq('user_id',userId).maybeSingle()
    if(error)throw error
    if(expectedAssistantContent&&data?.assistant_content&&!assistantContentMatchesForProvenance(data.assistant_content,expectedAssistantContent))return null
    return normalize(data?.provenance)
  }catch(error){console.error('supportTurnProvenance: latest-user provenance read failed',error);return null}
}

export async function attachRecordedTurnProvenance(conversationId: string,userId: string,assistantReply: string,provenance: unknown): Promise<boolean> {
  if (!validId(conversationId) || !userId) return false
  const normalized=normalize(provenance); if(!normalized)return false
  const expectedContent=normalizeAssistantContent(assistantReply); if(!expectedContent)return false
  const db=cosServiceDb(); if(!db)return false
  try {
    const { data: row, error: readError } = await db.from('assistant_messages').select('id,content').eq('conversation_id', conversationId).eq('user_id', userId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (readError || !row?.id || !assistantContentMatchesForProvenance(row.content,assistantReply)) return false
    const { error: updateError } = await db.from('assistant_messages').update({ provenance: normalized }).eq('id', row.id).eq('user_id', userId)
    if (updateError) throw updateError
    return true
  } catch (error) {
    console.error('supportTurnProvenance: provenance attach failed', error)
    return false
  }
}
