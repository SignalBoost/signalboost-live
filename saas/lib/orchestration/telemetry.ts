const sink: Array<Record<string, unknown>> = []

export function logOrchestrationEvent(event: string, metadata: Record<string, unknown> = {}) {
  const entry = {
    event,
    at: new Date().toISOString(),
    ...metadata,
  }
  sink.push(entry)
  if (sink.length > 200) sink.shift()
  console.log('orchestration:', entry)
  return entry
}

export function getOrchestrationTelemetry() {
  return [...sink]
}
