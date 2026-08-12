import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

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

export function normalizeAssistantContent(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
    .slice(0, MAX_STORED_CONTENT)
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
    const row = (data ?? []).find((item: any) => normalizeAssistantContent(item?.content) === expected)
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
  try{
    const {error}=await db.from('cos_latest_turn_provenance').upsert({user_id:userId,assistant_content:content,provenance:normalized,source:source||null,updated_at:new Date().toISOString()},{onConflict:'user_id'})
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
    if(expectedAssistantContent){const expected=normalizeAssistantContent(expectedAssistantContent);if(expected&&normalizeAssistantContent(data?.assistant_content)!==expected)return null}
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
    if (readError || !row?.id || normalizeAssistantContent(row.content)!==expectedContent) return false
    const { error: updateError } = await db.from('assistant_messages').update({ provenance: normalized }).eq('id', row.id).eq('user_id', userId)
    if (updateError) throw updateError
    return true
  } catch (error) {
    console.error('supportTurnProvenance: provenance attach failed', error)
    return false
  }
}
