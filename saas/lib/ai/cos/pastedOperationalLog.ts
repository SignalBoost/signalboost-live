// A pasted runtime/build log is evidence to analyze, not code to execute or a provenance query.
const OPERATIONAL_LOG = /(?:^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:running|cloning|installing|restored)\b|\b(?:running|cloning|installing|restored build cache)\b[\s\S]{0,160}\b(?:vercel|next\.js|npm|node)\b|\bvercel cli\s+\d)/im

export function isPastedOperationalLog(input: string): boolean {
  return OPERATIONAL_LOG.test(String(input || ''))
}
