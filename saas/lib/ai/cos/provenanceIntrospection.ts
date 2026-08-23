/** True only for a request to reveal the recorded origin of a prior answer. */
export function isProvenanceIntrospection(input: string): boolean {
  const provenance = /\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|cognitive skill|cognitive skills|procedural skill|procedural skills|autonomous research|external ai|external provider|internal systems?)\b/i
  const sourceAttribution = /\b(?:where|what)\b[\s\S]{0,50}\b(?:source|sources|from|based on|cite|citation|evidence)\b|\b(?:show|tell|explain)\b[\s\S]{0,50}\b(?:where|what)\b[\s\S]{0,30}\b(?:got|came|comes|generated|derived)\b/i
  const referent = /\b(previous|preceding|prior|last|just|that|this|answer|response|request|execution|used|invoked|contributed|generated|reasoning)\b/i
  return (provenance.test(input) || sourceAttribution.test(input)) && referent.test(input)
}
