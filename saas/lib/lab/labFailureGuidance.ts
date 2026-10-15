// Customer-safe interpretation of machine failure codes. Never retry a possibly paid job automatically.
export type LabFailureCategory = 'data'|'credentials'|'provider'|'uncertain'|'platform'|'other'
export function labFailureGuidance(code: string | null): { category: LabFailureCategory; retrySafe: false; nextStep: string } {
 const c=String(code??'').toLowerCase()
 if (/submission|ambiguous|unknown_job|lost_response|reserved/.test(c))
  return {category:'uncertain',retrySafe:false,nextStep:'Check the existing provider job or run status before attempting another paid operation.'}
 if (/credential|unauthorized|forbidden|token|permission|authentication/.test(c))
  return {category:'credentials',retrySafe:false,nextStep:'Check account permissions and the provider credential connection; do not share API keys with support.'}
 if (/dataset|prompt|examples|holdout|base_model|model_unsupported/.test(c))
  return {category:'data',retrySafe:false,nextStep:'Review the dataset or model selection, correct the input, and request a new run only after confirming costs.'}
 if (/provider|rate_limit|quota|funds|together|fireworks|huggingface/.test(c))
  return {category:'provider',retrySafe:false,nextStep:'Inspect the provider account and existing job status before authorizing another request.'}
 if (/db_|internal|timeout|unavailable|failed/.test(c))
  return {category:'platform',retrySafe:false,nextStep:'Use the run event history and contact iTMounts support with the run reference; do not send secrets.'}
 return {category:'other',retrySafe:false,nextStep:'Check the run history and contact support if the issue persists. Never retry paid training until its job status is known.'}
}
