import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  clearConversationArtifactContext,
  peekConversationArtifactContext,
} from '../lib/ai/cos/cosArtifactConversationContext.ts'
import { resolveFreshConversationContext } from '../lib/ai/cos/cosFreshConversationContext.ts'
import { detectDirectTextTransformation, splitQuotedEmailThread } from '../lib/ai/cos/textTransformationInput.ts'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const route = () => read('../app/api/cos-primary/route.ts')
const externalInfo = () => read('../lib/ai/tools/getExternalInfo.ts')
const structuredInfo = () => read('../lib/ai/tools/getStructuredLiveInfo.ts')
const externalSynthesis = () => read('../lib/ai/cos/freshEvidenceExternalSynthesis.ts')
const synthesisContract = () => read('../lib/ai/cos/freshEvidenceSynthesisContract.ts')

test('fresh/current facts retrieve live evidence before any model synthesis', () => {
  const source = route()
  const liveSearch = source.indexOf('await getExternalInfo(')
  const synthesis = source.indexOf('await synthesizeFreshEvidenceExternally(')
  assert.ok(liveSearch >= 0, 'fresh route must perform live retrieval')
  assert.ok(synthesis > liveSearch, 'external synthesis must happen only after live retrieval')
  assert.match(source, /bypassCache:\s*true/)
  assert.match(source, /freshEvidenceMeetsQuestionAuthority\(lookupInput, sources\)/)
})

test('fresh follow-ups resolve user context before retrieval and never trust assistant text', () => {
  const source = route()
  assert.match(source, /resolveFreshConversationContext\(body, input\)/)
  assert.match(source, /freshEvidenceSearchQuery\(lookupInput/)
  assert.match(source, /assistant_text_used_for_resolution:\s*false/)
  assert.match(source, /synthesizeFreshEvidenceExternally\(\{ input: lookupInput/)
})

test('writing follow-up carries only the adjacent assistant draft into the editor, never fresh evidence', () => {
  clearConversationArtifactContext()
  const originalRequest = 'edit - Dear AskISSO, Enterprise Wi Fi was installed in Paramaribo. Please help me ask who can provide the activation status.'
  const editedEmail = 'Dear AskISSO,\n\nEnterprise Wi-Fi was installed in Paramaribo a few months ago, but it has not yet been activated. Could you please let us know which office or person we should contact for information about its activation status?\n\nThank you.'
  const followup = 'what would be the subject line for this email?'
  const body = { messages: [
    { role: 'user', content: originalRequest },
    { role: 'assistant', content: editedEmail },
    { role: 'user', content: followup },
  ] }

  const resolution = resolveFreshConversationContext(body, followup)
  assert.equal(resolution.lookupInput, followup)
  assert.equal(resolution.contextUsed, false)

  const captured = peekConversationArtifactContext(followup)
  assert.ok(captured)
  assert.equal(captured.assistantArtifact, editedEmail)
  assert.equal(captured.previousUserText, originalRequest)

  const transformation = detectDirectTextTransformation(followup)
  assert.ok(transformation)
  const split = splitQuotedEmailThread(transformation.sourceText)
  assert.equal(split.editableSource, editedEmail)
  assert.match(split.referenceContext || '', /Dear AskISSO/i)
  clearConversationArtifactContext()
})

test('artifact continuation cannot scan backward past an intervening turn', () => {
  clearConversationArtifactContext()
  const followup = 'what would be the subject line for this email?'
  const body = { messages: [
    { role: 'user', content: 'Edit this email.' },
    { role: 'assistant', content: 'An older draft that must not be reused.' },
    { role: 'user', content: 'Switch topics to network inventory.' },
    { role: 'user', content: followup },
  ] }

  resolveFreshConversationContext(body, followup)
  assert.equal(peekConversationArtifactContext(followup), null)
  assert.equal(detectDirectTextTransformation(followup), null)
  clearConversationArtifactContext()
})

test('contextual volatile cache key uses resolved lookup input, not ambiguous surface text', () => {
  const source = route()
  assert.match(source, /writeVolatileAnswerCache\(\{[\s\S]*?prompt:\s*lookupInput/)
  assert.doesNotMatch(source, /writeVolatileAnswerCache\(\{[\s\S]{0,120}?prompt:\s*input,/)
})

test('fresh/current facts never invoke local Qwen or deterministic model-memory shortcuts', () => {
  const source = route()
  assert.doesNotMatch(source, /freshEvidenceLocalSynthesis/)
  assert.doesNotMatch(source, /synthesizeFreshEvidenceLocally/)
  assert.doesNotMatch(source, /resolveDeterministicFreshOfficeHolder/)
  assert.doesNotMatch(source, /callLocalModel/)
  assert.match(source, /local_model_invoked:\s*false/)
  assert.match(source, /policy:\s*'fresh_live_data_external_only'/)
})

test('high-frequency values require structured real-time data before ordinary web search', () => {
  const source = externalInfo()
  const cleanQuery = source.indexOf('structuredProviderQuery(q)')
  const structuredClass = source.indexOf('structuredLiveDataKind(structuredQuery)')
  const structuredFetch = source.indexOf('await getStructuredLiveInfo(structuredQuery, structuredKind)')
  const ordinarySearch = source.indexOf('await getWebSearchPort().search(')
  assert.ok(cleanQuery >= 0, 'external lookup must remove authority-search suffixes before structured lookup')
  assert.ok(structuredClass > cleanQuery, 'structured live-data classification must use the clean query')
  assert.ok(structuredFetch > structuredClass, 'structured provider must be called after classification')
  assert.ok(ordinarySearch > structuredFetch, 'ordinary web search must occur only after the structured branch has returned')
  assert.match(source, /if \(structuredKind\)[\s\S]*?return \{[\s\S]*?ok: structured\.ok/)
})

test('structured real-time adapter uses Brave rich callback and compact timestamped scalar evidence', () => {
  const source = structuredInfo()
  assert.match(source, /enable_rich_callback/)
  assert.match(source, /callback_key/)
  assert.match(source, /\/res\/v1\/web\/rich/)
  assert.match(source, /sourceKind:\s*'structured_realtime'/)
  assert.match(source, /cache:\s*'no-store'/)
  assert.match(source, /STRUCTURED_REALTIME vertical=/)
  assert.match(source, /observed_at=/)
  assert.match(source, /\.slice\(0, 480\)/)
  assert.match(source, /No structured real-time callback was available/)
})

test('fresh/current evidence synthesis prefers Gemini', () => {
  const source = externalSynthesis()
  assert.match(source, /modelPreference:\s*'gemini'/)
})

test('fresh/current model memory is explicitly forbidden by the synthesis contract', () => {
  const source = synthesisContract()
  assert.match(source, /evidence block is your ONLY permitted source of facts/)
  assert.match(source, /Your own memory is assumed stale and must not contribute facts/)
  assert.match(source, /EVIDENCE_INSUFFICIENT/)
})
