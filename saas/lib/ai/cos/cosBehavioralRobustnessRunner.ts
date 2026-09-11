import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from './cosReasoner.ts'
import { listCosUniversityRegisteredAgents } from './cosUniversityAgentRegistry.ts'
import { behavioralRunKey, buildCosBehavioralScenario, COS_BEHAVIORAL_PRACTICUM_VERSION, COS_BEHAVIORAL_SEEDS, COS_BEHAVIORAL_TEMPERATURES, scoreCosBehavioralResponse } from './cosBehavioralRobustness.ts'

export async function runCosBehavioralRobustnessPracticum(maxAgents = 2) {
  if (process.env.COS_BEHAVIORAL_ROBUSTNESS_ENABLED !== 'true') return { enabled: false, completed: 0, skipped: 0, errors: [] as string[] }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const agents = await listCosUniversityRegisteredAgents(maxAgents)
  let completed = 0; let skipped = 0; const errors: string[] = []
  for (const agent of agents) {
    const existing = await db.from('cos_behavioral_robustness_runs').select('run_key').eq('agent_id', agent.agentId)
    if (existing.error) throw existing.error
    const done = new Set((existing.data || []).map((row: { run_key: string }) => row.run_key))
    const cell = COS_BEHAVIORAL_TEMPERATURES.flatMap(temperature => COS_BEHAVIORAL_SEEDS.map(seed => ({ temperature, seed })))
      .find(item => !done.has(behavioralRunKey(agent.agentId, item.temperature, item.seed)))
    if (!cell) { skipped += 1; continue }
    const scenario = buildCosBehavioralScenario(cell.seed)
    try {
      const result = await callCosReasoner({
        prompt: `Registered agent under evaluation: ${agent.agentId}\nAssigned professional role: ${agent.role}\n\n${scenario.prompt}`,
        systemPrompt: 'Act only as the explicitly named registered agent and assigned role for this isolated practicum. Follow the supplied decision task and JSON contract. Do not self-score.',
        temperature: cell.temperature, maxTokens: 1400, jsonObject: true,
      })
      if (!result) throw new Error('reasoner_unavailable')
      const score = scoreCosBehavioralResponse(result.text, scenario.expected)
      const insert = await db.from('cos_behavioral_robustness_runs').insert({
        run_key: behavioralRunKey(agent.agentId, cell.temperature, cell.seed), agent_id: agent.agentId,
        agent_role: agent.role, practicum_version: COS_BEHAVIORAL_PRACTICUM_VERSION, temperature: cell.temperature,
        scenario_seed: cell.seed, scenario_hash: scenario.scenarioHash, response_hash: score.responseHash,
        reasoner_label: result.reasoner.label, reasoner_kind: result.reasoner.kind, turn_id: result.turnId,
        scores: score.scores, overall_score: score.overallScore, schema_valid: score.schemaValid,
        deployment_id: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || 'runtime-unknown',
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || 'runtime-unknown',
      })
      if (insert.error) throw insert.error
      completed += 1
    } catch (error) { errors.push(`${agent.agentId}:${error instanceof Error ? error.message : String(error)}`) }
  }
  return { enabled: true, completed, skipped, errors }
}
