// saas/lib/ai/cos/groundingConcepts.ts
//
// RELEVANCE MUST MATCH ON MEANING, NOT ON SPELLING.
//
// grounding.ts scores a corpus row against a question by counting shared literal tokens. That is
// cheap and deterministic, and it has one failure mode that dominates technical questions: a
// reference table and the question it answers rarely share vocabulary. The table says "kW",
// "TDP", "wall power"; the question says "power cost savings", "kWh". Exact-token matching sees
// almost nothing in common.
//
// Measured on production behaviour (2026-08-26). For the question "512 H100s ... break-even
// egress versus power cost savings ($0.11/kWh vs $0.03/kWh)":
//
//   power-constants document : 1 hit  ('power')                 -> 0.071
//   latency document         : 2 hits ('us-east', 'eu-north')   -> 0.143
//
// The latency document ranked twice as high because it happened to contain the two PLACE NAMES
// from the question. The document that actually held the needed constant (~10 kW per 8-GPU node,
// so ~640 kW for 512 GPUs) lost, and the answer invented a cluster power figure three separate
// times across three runs — 358 kW, then 1.5 MW, then 1.8 MW.
//
// A first attempt at this fix preserved numeric tokens instead, on the theory that stripping
// '512' and '0.11' was the cause. Measured: relevance went DOWN (0.071 -> 0.056), because the
// question's numbers do not appear in the document — its numbers are 700 and 1280. Preserving
// them only enlarged the denominator. That attempt was discarded.
//
// What actually connects them is the CONCEPT. Both sides talk about electrical power; only the
// words differ. So both sides are expanded into concept tokens before scoring, and a row that
// discusses the same quantity under different vocabulary now matches.
//
// DESIGN CONSTRAINTS:
//   - Expansion is symmetric. Query and evidence run through the same function, so this sharpens
//     matching rather than inflating every score.
//   - Concepts are added, never substituted. Literal matches keep working exactly as before.
//   - One concept token per cluster per text, deduplicated, so a document repeating "kW" twelve
//     times does not outrank a more relevant one.
//   - Deliberately small and domain-specific. A general thesaurus would match everything to
//     everything, which is the failure mode on the other side of this.
//
// Zero imports, pure functions.

/**
 * Domain clusters. Every surface form in a cluster expands to the same concept token, so a
 * question and a reference row that discuss one quantity in different vocabulary intersect.
 *
 * Keys are the concept tokens (prefixed so they can never collide with a real word).
 */
const CONCEPT_CLUSTERS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['~power', ['power', 'powered', 'w', 'kw', 'kwh', 'mw', 'mwh', 'gw', 'watt', 'watts', 'wattage', 'kilowatt', 'megawatt', 'electricity', 'electrical', 'draw', 'consumption', 'consumes', 'tdp', 'load', 'pue', 'energy']],
  ['~cost', ['cost', 'costs', 'costly', 'price', 'pricing', 'priced', 'spend', 'spending', 'saving', 'savings', 'save', 'saves', 'cheaper', 'expense', 'expenses', 'budget', 'billing', 'billed', 'rate', 'fee', 'fees', 'economics', 'payback', 'amortize', 'amortized']],
  ['~bandwidth', ['bandwidth', 'throughput', 'gbps', 'mbps', 'tbps', 'bps', 'link', 'interconnect', 'network', 'networking', 'transfer', 'egress', 'ingress', 'sustained']],
  ['~latency', ['latency', 'rtt', 'roundtrip', 'round-trip', 'delay', 'ping', 'propagation']],
  ['~storage', ['storage', 'stored', 'gb', 'tb', 'pb', 'mb', 'gib', 'tib', 'bytes', 'byte', 'capacity', 'volume', 'size', 'sized', 'footprint']],
  ['~cooling', ['cooling', 'cooled', 'thermal', 'temperature', 'heat', 'chiller', 'crac', 'crah', 'cdu', 'coolant', 'delta-t', 'airflow', 'hvac']],
  ['~flow', ['flow', 'flowrate', 'lpm', 'gpm', 'pump', 'pumps', 'pressure', 'kpa', 'psi', 'cavitation', 'hydraulic']],
  ['~checkpoint', ['checkpoint', 'checkpoints', 'checkpointing', 'snapshot', 'optimizer', 'adam', 'adamw', 'moments', 'resume', 'restore', 'sharded', 'sharding', 'reshard', 'resharding']],
  ['~model', ['model', 'models', 'parameters', 'parameter', 'params', 'weights', 'bf16', 'fp16', 'fp32', 'fp8', 'int8', 'quantization', 'quantized', 'precision', 'pretraining', 'training', 'inference']],
  ['~reliability', ['reliability', 'availability', 'uptime', 'redundancy', 'redundant', 'failover', 'mtbf', 'mttr', 'nines', 'outage', 'failure', 'failures', 'fault']],
  ['~electrical', ['ups', 'pdu', 'breaker', 'circuit', 'battery', 'batteries', 'generator', 'amps', 'ampere', 'voltage', 'volts', 'phase', 'impedance', 'transformer']],
  ['~diagnosis', ['diagnose', 'diagnosis', 'diagnostic', 'troubleshoot', 'hypothesis', 'hypotheses', 'symptom', 'symptoms', 'cause', 'causes', 'falsifier', 'evidence', 'telemetry', 'measurement', 'measurements', 'reading', 'readings']],
  ['~compute', ['gpu', 'gpus', 'h100', 'h100s', 'a100', 'cpu', 'cluster', 'node', 'nodes', 'rack', 'racks', 'server', 'servers', 'accelerator']],
]

/** Surface form -> concept token. Built once at module load. */
const CONCEPT_BY_TERM: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const [concept, forms] of CONCEPT_CLUSTERS) {
    for (const form of forms) if (!map.has(form)) map.set(form, concept)
  }
  return map
})()

/**
 * Concept tokens implied by a set of already-tokenised terms.
 *
 * Also handles the compound case: reference material writes "electricity-cost" and
 * "node-level", which tokenise as one hyphenated term. Each hyphen-separated part is checked so
 * those still reach their concept.
 */
export function conceptTokens(terms: readonly string[]): string[] {
  const found = new Set<string>()
  for (const term of terms) {
    const direct = CONCEPT_BY_TERM.get(term)
    if (direct) found.add(direct)
    if (term.includes('-')) {
      for (const part of term.split('-')) {
        const partial = CONCEPT_BY_TERM.get(part)
        if (partial) found.add(partial)
      }
    }
    // A quantity written with its unit attached ("700w", "10kw", "12tb") carries the concept too.
    const withUnit = /^[\d.]+([a-z]+)$/.exec(term)
    if (withUnit) {
      const unit = CONCEPT_BY_TERM.get(withUnit[1])
      if (unit) found.add(unit)
    }
  }
  return [...found]
}

/** Exposed for tests and for anyone auditing why two texts matched. */
export function conceptOf(term: string): string | undefined {
  return CONCEPT_BY_TERM.get(String(term ?? '').toLowerCase())
}
