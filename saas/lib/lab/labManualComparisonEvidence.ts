// Explicit customer-controlled export of a manual response comparison.
// Not independently verified; no external calls, secrets, or automatic persistence.
export type ManualComparisonVote = 'base' | 'trained' | 'tie'
export type ManualComparisonInput = Readonly<{
  runId: string; baseModel: string; trainedModel: string
  prompt: string; baseResponse: string; trainedResponse: string
  vote: ManualComparisonVote
}>
export function buildManualComparisonEvidence(input: ManualComparisonInput) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(input.runId)) throw new Error('run_id_invalid')
  if (!input.baseModel.trim() || !input.trainedModel.trim()) throw new Error('models_required')
  if (!['base','trained','tie'].includes(input.vote)) throw new Error('vote_invalid')
  const prompt=input.prompt.trim(), base=input.baseResponse.trim(), trained=input.trainedResponse.trim()
  if (!prompt || !base || !trained) throw new Error('responses_required')
  if (prompt.length > 4000 || base.length > 20000 || trained.length > 20000) throw new Error('comparison_too_long')
  return Object.freeze({
    schema:'itmounts.manual-response-comparison.v1',
    origin:'customer-supplied',
    verification:'not-independent',
    assessment:'subjective-single-prompt',
    runId:input.runId,
    baseModel:input.baseModel.trim(), trainedModel:input.trainedModel.trim(),
    prompt, responses:{base,trained}, vote:input.vote,
  })
}
