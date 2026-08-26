// saas/lib/ai/cos/engineeringConstants.ts
//
// THE CONSTANTS ARE PINNED INTO THE PROMPT, NOT LEFT TO RETRIEVAL OR JUDGEMENT.
//
// Every softer approach was tried first, over one day, and each was verified in production:
//
//   1. Corpus documents. Written, ingested, retrievable. The model cited them for narrative
//      material (RTT floors, resharding mechanics) and never for the numeric tables.
//   2. Retrieval ranking. Fixed — a power document went from ranking below a latency document on
//      a power question to ranking first. Selection improved; the wrong number did not change.
//   3. A policy rule. "Fill gaps with labelled assumptions rather than refusing." Outnumbered by
//      the prompt's several anti-assertion rules; the model refused instead.
//   4. An explicit three-way classification — GIVEN / STANDARD / SITUATIONAL — naming "device
//      power ratings" as the first example of STANDARD. The model adopted the vocabulary
//      immediately and then classified the power draw of 512 H100s as SITUATIONAL, and assumed
//      1000 kW anyway. It can recite the rule and cannot apply it.
//
// Across five runs the same cluster drew 358 kW, 1.5-2.0 MW, 1.8 MW, 83.2 kW and 1000 kW. The
// true figure is ~653 kW, and the model states 10-12 kW per 8-GPU node correctly when asked for
// that alone. The failure is never recall — it is holding a fact while carrying a calculation.
//
// So the judgement step is removed. These figures are injected on every technical answer, the way
// the canonical COS definitions already are: not retrieved, not ranked, not classified, simply
// present. The model does not decide whether they are relevant; it reads them.
//
// SCOPE DISCIPLINE. This is a short list of stable published constants for the domains COS is
// actually asked about. It is NOT a knowledge base — anything situational, anything that changes
// with a vendor's price list, and anything the reader alone can know stays out and stays in the
// corpus. Every entry here must be a figure a competent engineer would recognise without
// looking it up, and would not expect to change this year.
//
// Zero imports.

/**
 * Compact reference block. Deliberately terse: this competes for prompt space with the answer
 * policy and the charter, so every line has to earn its place.
 */
export const ENGINEERING_CONSTANTS: readonly string[] = [
  'REFERENCE CONSTANTS — use these directly; they are correct and require no citation. Prefer a figure stated in the request over any of these.',
  '',
  'GPU and node power (use the NODE figure for any facility, cost or cooling calculation; bare TDP only when the question is explicitly about the GPU alone):',
  '- H100 SXM5 700 W TDP; H100 PCIe/NVL 350-400 W; A100 SXM4 400 W; L40S 350 W.',
  '- An 8-GPU HGX/DGX H100 node draws ~10.2 kW at the wall (CPUs, DRAM, NVSwitch, NICs, fans and PSU losses included) — roughly 1.8-2.0x the summed GPU TDP.',
  '- So 512 H100s = 64 nodes = ~653 kW at the wall; 1,024 H100s = 128 nodes = ~1.3 MW.',
  '- PUE (typically 1.1-1.5) multiplies facility power but CANCELS from a price-difference calculation when both sites are comparable. Say which figure you used.',
  '',
  'Training state size (mixed-precision Adam/AdamW holds five tensors per parameter, not one):',
  '- BF16/FP16 2 bytes; FP32 4 bytes; FP8/INT8 1 byte; INT4/NF4 0.5 bytes.',
  '- Adam moments m and v are FP32, 4 bytes each. Master weights are FP32, 4 bytes. The BF16 compute copy is 2 bytes. Gradients are usually not checkpointed.',
  '- Checkpoint total is therefore ~14 bytes/parameter: a 70B checkpoint is ~980 GB, a 1T checkpoint ~14 TB.',
  '',
  'Units and billing:',
  '- Vendors bill storage, egress and bandwidth in DECIMAL units: 1 GB = 10^9 bytes, 1 TB = 10^12. Memory and filesystems report BINARY (GiB, TiB). The gap is 7.4% at GB and 10.0% at TB. Use decimal for money.',
  '- Storage is bytes, network is bits: multiply by 8. 1 month = 730 hours for billing; 1 year = 8,760 hours.',
  '',
  'Network physics:',
  '- Light in fibre travels ~200,000 km/s: ~5 us per km one way. US-East to EU-North is ~35-45 ms round trip, US-West to EU-North ~70-90 ms. These are floors; real routes are longer.',
  '- Bandwidth-delay product = bandwidth x RTT. A window-limited protocol cannot exceed window/RTT regardless of link capacity.',
  '',
  'Datacenter thermal and electrical:',
  '- Water: specific heat 4.19 kJ/kg.K, so Q_kW = flow_L/min x deltaT_K x 0.0698. Air is ~3,500x worse per unit volume, which is why dense racks go liquid.',
  '- Q = m_dot x cp x deltaT links heat, flow and temperature rise: any TWO determine the third, so a pressure drop and a deltaT alone diagnose nothing without flow.',
  '- Continuous electrical load is limited to 80% of breaker rating (NEC 210): a 30 A breaker carries 24 A continuously. In a 2N design each path must carry the whole load, so per-path utilisation cannot exceed 50%.',
  '- IT electrical load becomes heat essentially one-for-one: power added is cooling load added.',
  '- ASHRAE rack INLET air: 18-27 C recommended, 15-32 C allowable for class A1.',
  '',
  'Queueing and reliability:',
  '- Little\'s Law: items in system = arrival rate x time in system.',
  '- Mean wait scales as 1/(1 - utilisation): 80% utilisation is 5x service time, 90% is 10x, 95% is 20x. Utilisation headroom is never linear.',
  '- Availability = MTBF/(MTBF+MTTR). Series dependencies multiply down; parallel redundancy only helps to the extent the paths are genuinely independent.',
]

/** Single string form, for callers that assemble their prompt as text. */
export function engineeringConstantsText(): string {
  return ENGINEERING_CONSTANTS.join('\n')
}
