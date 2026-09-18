export const HF_TERMINAL_FAILURE_MARKERS = Object.freeze([
  'HTTP Error 400',
  'HTTP Error 401',
  'HTTP Error 403',
  'HTTP Error 404',
  'huggingface_training_not_configured',
  'huggingface_training_signature_invalid',
  'huggingface_training_payload_invalid',
  'huggingface_training_source_dataset_ref_required',
  'huggingface_training_materialized_dataset_refs_required',
  'hf_worker_delivery_token_invalid',
  'worker artifact unavailable',
])

export function isTerminalHuggingFaceFailure(reason: unknown): boolean {
  const text = String(reason ?? '')
  return HF_TERMINAL_FAILURE_MARKERS.some(marker => text.includes(marker))
}
