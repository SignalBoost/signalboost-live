import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isConciergeVisualObjective } from '../lib/visuals/intent.ts'
import { resolveSemanticVisualRequest } from '../lib/visuals/semanticIntent.ts'
import { publicConciergeIdentityReply } from '../lib/ai/cos/publicConciergeIdentity.ts'

const semanticReasoner = (verdict: { visual_request: boolean; anchor_user_turn: number | null }, seen?: any[]) => (async (args: any) => {
  seen?.push(args)
  return { text: JSON.stringify(verdict) }
}) as any

test('the reported iTMounts logo conversation uses deep semantic continuation for ambiguous turns', async () => {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const turns = [
    'design the new lname and logo for the plaftorm itmounts',
    'design a new logo for the platform - the new name name is itmounts',
    'the new name of the platform is itmounts - how would you design the new name?',
    'thnak you for suggestion, but your design is not very creative, can you do something better than that?',
    'i did not ask for your suggestions, i want the design',
  ]

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index]
    messages.push({ role: 'user', content: turn })
    if (isConciergeVisualObjective(turn)) {
      assert.equal(isConciergeVisualObjective(turn), true, turn)
    } else {
      const seen: any[] = []
      const resolved = await resolveSemanticVisualRequest(
        messages,
        turn,
        semanticReasoner({ visual_request: true, anchor_user_turn: 0 }, seen),
      )
      assert.ok(resolved, `expected semantic visual continuation for: ${turn}`)
      assert.match(resolved.objective, /itmounts/i)
      assert.match(resolved.objective, new RegExp(turn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      assert.equal(seen.length, 1)
      assert.match(String(seen[0]?.systemPrompt || ''), /Use meaning, not keyword or regex matching/i)
      assert.match(String(seen[0]?.prompt || ''), /RECENT USER TURNS:/)
    }
    messages.push({ role: 'assistant', content: 'assistant prose is not routing authority' })
  }
})

test('deep semantic visual routing fails closed for discussion and topic changes', async () => {
  const base = [
    { role: 'user' as const, content: 'design a new logo for iTMounts' },
    { role: 'assistant' as const, content: 'Here is the first version.' },
  ]

  const revision = 'Can you make it more minimal?'
  const continued = await resolveSemanticVisualRequest(
    [...base, { role: 'user', content: revision }],
    revision,
    semanticReasoner({ visual_request: true, anchor_user_turn: 0 }),
  )
  assert.ok(continued)
  assert.equal(continued.continuation, true)
  assert.match(continued.objective, /design a new logo for iTMounts/)
  assert.match(continued.objective, /Can you make it more minimal\?/)

  for (const unrelated of [
    'Explain how it works',
    'Draft a launch announcement about it',
    'Tell me what you think about the logo',
  ]) {
    assert.equal(
      await resolveSemanticVisualRequest(
        [...base, { role: 'user', content: unrelated }],
        unrelated,
        semanticReasoner({ visual_request: false, anchor_user_turn: null }),
      ),
      null,
      unrelated,
    )
  }

  const interrupted = [
    ...base,
    { role: 'user' as const, content: 'What is the pricing?' },
    { role: 'assistant' as const, content: 'Pricing answer.' },
    { role: 'user' as const, content: 'Make it better' },
  ]
  assert.equal(
    await resolveSemanticVisualRequest(interrupted, 'Make it better', semanticReasoner({ visual_request: false, anchor_user_turn: null })),
    null,
  )
})

test('visual continuity intelligence is model-based while deterministic code stays structural', async () => {
  const conversationSource = await readFile(new URL('../lib/visuals/conversationIntent.ts', import.meta.url), 'utf8')
  const semanticSource = await readFile(new URL('../lib/visuals/semanticIntent.ts', import.meta.url), 'utf8')
  const routeSource = await readFile(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(conversationSource, /VISUAL_REVISION_PATTERNS|TEXTUAL_DISCUSSION|isVisualRevisionRequest/)
  assert.match(semanticSource, /callCosReasoner/)
  assert.match(semanticSource, /resolveSemanticVisualRequest/)
  assert.match(routeSource, /await resolveSemanticVisualRequest\(messages, prompt\)/)
  assert.doesNotMatch(routeSource, /resolveConciergeVisualObjective/)
})

test('public employer questions cannot reach model inference in any supported language', () => {
  const cases = [
    ['what is the name of your employer?', 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.'],
    ["What's your employer?", 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.'],
    ['Who is your current employer?', 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.'],
    ['¿cuál es el nombre de tu empleador?', 'Soy iTMounts Concierge, un asistente de IA, no una persona, así que no tengo empleador.'],
    ['qual é o nome do seu empregador?', 'Sou o iTMounts Concierge, um assistente de IA, não uma pessoa, portanto não tenho empregador.'],
    ['jak nazywa się twój pracodawca?', 'Jestem iTMounts Concierge, asystentem sztucznej inteligencji, a nie osobą, więc nie mam pracodawcy.'],
    ['как называется твой работодатель?', 'Я — iTMounts Concierge, ИИ-ассистент, а не человек, поэтому у меня нет работодателя.'],
  ] as const

  for (const [prompt, reply] of cases) {
    assert.deepEqual(publicConciergeIdentityReply(prompt), {
      reply,
      source: 'concierge-public-identity',
    })
  }

  for (const prompt of [
    'Who employs the Department of State?',
    'What can you tell me about employer branding?',
    'Who do you think an employer should hire?',
    'como melhorar a marca de um empregador?',
  ]) {
    assert.equal(publicConciergeIdentityReply(prompt), null, prompt)
  }
})

test('public company identity uses iTMounts and the public model prompt cannot reintroduce SignalBoost', async () => {
  assert.deepEqual(publicConciergeIdentityReply('what is the name of our company?'), {
    reply: 'Our company and public platform are named iTMounts.',
    source: 'concierge-public-company-identity',
  })

  const legacyRoute = await readFile(new URL('../app/api/support/routeCoreLegacy.ts', import.meta.url), 'utf8')
  const browserRoute = await readFile(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(legacyRoute, /return publicBrandText\(`You are the \$\{portableBrandName\(\)\} Concierge/)
  assert.match(browserRoute, /\.replace\(\/\\bCOS\\b\/g, PUBLIC_BRAND\.name\)/)
  assert.doesNotMatch(browserRoute, /\.replace\(\/\\bCOS\\b\/g, 'SignalBoost'\)/)
})

test('new semantic-only visual requests still reach deep semantic visual detection', async () => {
  const source = await readFile(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(source, /const directVisual = isConciergeVisualObjective\(prompt\)/)
  assert.match(source, /const semanticResolution = directVisual \? null : await resolveSemanticVisualRequest\(messages, prompt\)/)
  assert.match(source, /const visualObjective = directVisual \? prompt : semanticResolution\?\.objective \?\? null/)
})

test('visual success copy is blocked without a renderable preview', async () => {
  const source = await readFile(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(source, /visual_delivery_unverified/)
  assert.match(source, /I will not claim it was delivered/)
  assert.match(source, /existingPreview/)
})
