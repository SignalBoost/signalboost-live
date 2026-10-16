/** Public-source capability map for REA-led customer LAB improvements.
 * A reference is NOT an installed connector; all operations require their own
 * authorized adapter, tenant boundaries and explicit paid-action gate.
 */
export type LabReferencePlatform = 'huggingface' | 'wandb' | 'mlflow' | 'sagemaker' | 'vertex' | 'foundry' | 'together' | 'fireworks'
export type LabReferenceStatus = 'reference_only' | 'source_implemented' | 'production_verified'
export type LabReuseRoute = 'documented_api' | 'open_source' | 'workflow_pattern'
export type LabReferenceCapability = Readonly<{
  id: string
  platform: LabReferencePlatform
  capability: 'model_discovery' | 'experiment_tracking' | 'evaluation' | 'training' | 'deployment' | 'dataset_lineage'
  reuse: LabReuseRoute
  source: string
  status: LabReferenceStatus
  approvalRequiredForExternalAction: true
  notes: string
}>
/** No production_verified flags without real transaction proof. */
export const LAB_REA_CAPABILITY_REFERENCES: readonly LabReferenceCapability[] = Object.freeze([
 {id:'hf-hub-discovery',platform:'huggingface',capability:'model_discovery',reuse:'documented_api',source:'https://huggingface.co/docs/hub/api',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Read-only model and dataset metadata first; enforce rate limits and dataset licensing.'},
 {id:'hf-jobs-training',platform:'huggingface',capability:'training',reuse:'documented_api',source:'https://huggingface.co/docs/hub/jobs',status:'source_implemented',approvalRequiredForExternalAction:true,notes:'Existing BYOI HF Jobs transport; execution costs require customer confirmation.'},
 {id:'wandb-evals',platform:'wandb',capability:'evaluation',reuse:'documented_api',source:'https://weave-docs.wandb.ai/guides/core-types/evaluations',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Reuse evaluation workflow semantics, never imply a W&B account or connected API.'},
 {id:'mlflow-tracking',platform:'mlflow',capability:'experiment_tracking',reuse:'open_source',source:'https://mlflow.org/docs/latest/api_reference/rest-api.html',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Investigate permissively licensed tracking protocol and isolate each organization.'},
 {id:'sagemaker-lifecycle',platform:'sagemaker',capability:'deployment',reuse:'workflow_pattern',source:'https://docs.aws.amazon.com/sagemaker/',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Study deployment handoff without pretending SageMaker is a connected LAB provider.'},
 {id:'vertex-model-garden',platform:'vertex',capability:'model_discovery',reuse:'workflow_pattern',source:'https://cloud.google.com/vertex-ai/docs/model-garden/explore-models',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Compare eligibility, capability and regional availability; do not import protected assets.'},
 {id:'foundry-evaluations',platform:'foundry',capability:'evaluation',reuse:'workflow_pattern',source:'https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/evaluate-generative-ai-app',status:'reference_only',approvalRequiredForExternalAction:true,notes:'Use side-by-side evaluation pattern with identical prompts and provenance.'},
 {id:'together-training',platform:'together',capability:'training',reuse:'documented_api',source:'https://docs.together.ai/docs/fine-tuning-overview',status:'source_implemented',approvalRequiredForExternalAction:true,notes:'Existing BYOI fine-tuning adapter; never submit implicitly.'},
 {id:'fireworks-training',platform:'fireworks',capability:'training',reuse:'documented_api',source:'https://fireworks.ai/docs/fine-tuning/fine-tuning-models',status:'source_implemented',approvalRequiredForExternalAction:true,notes:'Existing BYOI SFT adapter; no inference of production validation.'},
])
export function listLabReaReferences(capability?:LabReferenceCapability['capability']) {
 return LAB_REA_CAPABILITY_REFERENCES.filter(x=>!capability||x.capability===capability)
}
