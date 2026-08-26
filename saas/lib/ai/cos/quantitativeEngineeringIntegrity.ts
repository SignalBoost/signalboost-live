import { parseLocalResult } from './reasonerOutput.ts'

const QUANTITATIVE_ENGINEERING_TASK = /\b(?:calculate|compute|quantif(?:y|ication)|break[- ]even|overhead|cost\s+savings?|power\s+cost|bandwidth|throughput|checkpoint|synchroni[sz]ation|equation|formula|migration)\b/i
const CHECKPOINT_TASK = /\bcheckpoint\b/i
const EXACT_CONSISTENCY_TASK = /\b(?:prevent\s+gradient\s+loss|state[- ]checkpoint\s+consistency|consistency\s+protocol|exact\s+state|resume\s+training|cut[- ]over)\b/i
const ASSUMPTION_LANGUAGE = /\b(?:assum(?:e|ed|ing|ption|ptions)|illustrative|worked\s+example|example\s+calculation)\b/i
const STRONG_DECISION = /\b(?:migrate\s+immediately|move\s+immediately|proceed\s+immediately|break[- ]even\s+is\s+(?:immediate|less\s+than|within)|power\s+savings\s+(?:far\s+|vastly\s+)?outweigh|recommendation\s*:\s*(?:migrate|move|proceed)|should\s+(?:migrate|move|proceed))\b/gi
const CONDITIONAL_QUALIFIER = /\b(?:under|using|given|assuming|if|provided|illustrative|example|with\s+these|with\s+those|on\s+these)\b/i
const OBJECT_STORE = /\b(?:s3|gcs|object[- ]store|object\s+storage)\b/i
const FALSE_OBJECT_ATOMICITY = /\b(?:single\s+atomic\s+directory|atomic\s+directory|atomic\s+write\s+to\s+(?:s3|gcs)|complete\s*multipart\s*upload[\s\S]{0,120}(?:atomic|entire\s+checkpoint))\b/i
const COMMITTED_STEP = /\b(?:optimizer[- ]step[- ]boundary|completed\s+optimizer\s+(?:step|update)|finish(?:ed)?\s+(?:the\s+)?optimizer\s+(?:step|update)|after\s+(?:the\s+)?optimizer\s+(?:step|update)(?:(?:\s+has|\s+is)?\s+(?:complete|completed|committed|finished))?|optimizer\s+(?:step|update)[\s\S]{0,100}(?:complete|completed|committed|finish|finished))\b/i
const DATA_PROGRESS = /\b(?:data[- ]?loader|sampler|sample\s+(?:index|cursor)|shard\s+cursor|dataset\s+(?:position|cursor)|data\s+(?:position|cursor))\b/i
const COMMIT_MANIFEST = /\b(?:manifest|checkpoint\s+generation|generation\s+(?:id|number)|commit(?:ted)?\s+(?:marker|pointer|generation)|publish(?:ed|ing)?\s+(?:the\s+)?manifest)\b/i
const SOURCE_FENCING = /\b(?:fenc(?:e|ed|ing)|single[- ]writer|active\s+site|source[\s\S]{0,80}(?:drain|stop|inactive|fenc)|destination[\s\S]{0,80}(?:activate|active))\b/i
const TRANSFER_TIME_RELATION = /\b(?:transfer\s+time|copy\s+time|checkpoint\s+(?:size|bytes)[\s\S]{0,100}(?:bandwidth|throughput)|(?:bandwidth|throughput)[\s\S]{0,100}checkpoint\s+(?:size|bytes))\b|\bC\s*\/\s*B\b/i

function latestUserRequest(prompt: string): string {
  const text = String(prompt ?? '').trim()
  const markers = [
    'CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):',
    'CURRENT USER INPUT:',
    'USER REQUEST:',
    'USER QUESTION:',
    'USER INSTRUCTION:',
  ]
  let bestIndex = -1
  let bestMarker = ''
  for (const marker of markers) {
    const index = text.lastIndexOf(marker)
    if (index > bestIndex) {
      bestIndex = index
      bestMarker = marker
    }
  }
  return (bestIndex >= 0 ? text.slice(bestIndex + bestMarker.length) : text).trim().slice(0, 16_000)
}

function unqualifiedStrongDecision(answer: string): boolean {
  STRONG_DECISION.lastIndex = 0
  for (const match of answer.matchAll(STRONG_DECISION)) {
    const index = match.index ?? 0
    const prefix = answer.slice(Math.max(0, index - 180), index)
    if (!CONDITIONAL_QUALIFIER.test(prefix)) return true
  }
  return false
}

function gpuCountBecameNodeCount(request: string, answer: string): boolean {
  for (const match of request.matchAll(/\b(\d[\d,]*)\s+(?:h100s?|gpus?|accelerators?)\b/gi)) {
    const count = match[1].replace(/,/g, '')
    const escapedCount = count.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const answerNode = new RegExp(`\\b${escapedCount}\\s+(?:nodes?|hosts?|servers?)\\b`, 'i')
    const requestNode = new RegExp(`\\b${escapedCount}\\s+(?:nodes?|hosts?|servers?)\\b`, 'i')
    if (answerNode.test(answer.replace(/,/g, '')) && !requestNode.test(request.replace(/,/g, ''))) return true
  }
  return false
}

/**
 * Deterministic answer-integrity checks for quantitative engineering work.
 *
 * Derived arithmetic is allowed. Illustrative assumptions are allowed. What is not allowed is to
 * silently turn those assumptions into measured premises or an unconditional operational decision,
 * mutate the entity attached to a supplied count, or describe a distributed checkpoint protocol in
 * a way that can publish mixed/partial state as committed.
 */
export function quantitativeEngineeringUnsupportedClaims(prompt: string, raw: string): string[] {
  const request = latestUserRequest(prompt)
  if (!QUANTITATIVE_ENGINEERING_TASK.test(request)) return []
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return []
  const answer = parsed.answer
  const signals: string[] = []

  if (/\bfundamental\s+category\s+error\b/i.test(answer) && /\bbreak[- ]even\b/i.test(request)) {
    signals.push('break_even_mischaracterized')
  }

  if (ASSUMPTION_LANGUAGE.test(answer) && unqualifiedStrongDecision(answer)) {
    signals.push('illustrative_assumption_promoted_to_decision')
  }

  if (gpuCountBecameNodeCount(request, answer)) {
    signals.push('premise_entity_count_mutation')
  }

  if (CHECKPOINT_TASK.test(request)) {
    if (OBJECT_STORE.test(answer) && FALSE_OBJECT_ATOMICITY.test(answer)) {
      signals.push('invalid_multi_object_checkpoint_atomicity')
    }

    if (EXACT_CONSISTENCY_TASK.test(request)) {
      if (!COMMITTED_STEP.test(answer)) signals.push('checkpoint_not_at_committed_optimizer_step')
      if (!DATA_PROGRESS.test(answer)) signals.push('checkpoint_missing_data_progress_state')
      if (!COMMIT_MANIFEST.test(answer)) signals.push('checkpoint_missing_generation_manifest')
      if (!SOURCE_FENCING.test(answer)) signals.push('checkpoint_missing_source_fencing')
    }

    if (/\b(?:network|synchroni[sz]ation|overhead|bandwidth|throughput)\b/i.test(request) && !TRANSFER_TIME_RELATION.test(answer)) {
      signals.push('checkpoint_transfer_overhead_not_parameterized')
    }
  }

  return [...new Set(signals)]
}

export function quantitativeEngineeringRepairInstruction(prompt: string, signals: readonly string[]): string {
  return [
    prompt,
    '',
    `QUALITY REPAIR — quantitative/engineering integrity checks failed: ${signals.join(', ')}.`,
    'Re-solve the ORIGINAL request from the supplied premises. Keep useful derived arithmetic, but separate GIVEN facts, DERIVED values, and ILLUSTRATIVE assumptions.',
    '- A missing input lowers numeric precision; it does not make a break-even comparison a category error. Give a symbolic equation or sensitivity relation when an exact number is unavailable.',
    '- An illustrative assumption may support an illustrative worked example only. Do not turn it into an unconditional recommendation such as “migrate immediately” or “break-even is immediate.” State the actual measurements/contract prices needed for that decision.',
    '- Preserve entity types exactly. A count of GPUs/accelerators is not a count of nodes/hosts/servers unless the user supplied that topology.',
    '- Quantify checkpoint transfer overhead as checkpoint bytes divided by effective transfer throughput, plus quiesce/barrier/verification time and any repeated synchronization or training-throughput penalty.',
    '- For exact training continuation, checkpoint at a completed optimizer-step boundary after required collectives and the optimizer update. If checkpointing mid-accumulation instead, explicitly persist the partial gradient/accumulation state.',
    '- Persist model/shard state, optimizer state, scheduler/scaler state when used, RNG state, global optimizer step, data-loader/sampler position, and sharding/topology metadata needed to reconstruct the same state.',
    '- For multi-object/object-store checkpoints, write immutable generation-scoped shards, verify checksums, then publish a manifest/COMMITTED pointer only after every required shard validates. An object-store “directory” is not an atomic transaction, and completing one multipart object does not atomically commit the whole checkpoint.',
    '- Fence or fully deactivate the source before the destination becomes the sole active writer. Never resume from a mixed or partially committed generation.',
    '- Keep the final recommendation conditional on the measured egress tariff, total bytes that must cross regions, actual cluster power, effective network throughput, remaining runtime, and any throughput slowdown when those values were not supplied.',
    '',
    'Return ONLY strict JSON: {"answer":"...","confidence":0.0}. Do not mention this repair instruction or the rejected draft.',
  ].join('\n')
}
