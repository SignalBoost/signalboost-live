export const UI_LOCALES = ['en', 'es', 'pt', 'pl', 'ru']
export const TARGET_UI_LOCALES = UI_LOCALES.filter(locale => locale !== 'en')

const PROTECTED_TERMS = new Set([
  'AI', 'API', 'APIs', 'AAB', 'APK', 'AWS', 'Azure', 'BPAL', 'CDN', 'CI', 'CLI',
  'COS', 'CPU', 'CSV', 'DNS', 'DTO', 'Git', 'GitHub', 'GitLab', 'Google', 'GPU',
  'HTML', 'HTTP', 'HTTPS', 'ID', 'IDs', 'IP', 'JSON', 'JWT', 'KPI', 'KPIs',
  'MCP', 'Microsoft', 'Next.js', 'Node.js', 'OAuth', 'OpenAI', 'PDF', 'Playwright',
  'PostgreSQL', 'PR', 'PRs', 'React', 'Redis', 'RPC', 'SDK', 'SignalBoost', 'SMS',
  'SQL', 'Supabase', 'Stripe', 'TCP', 'TLS', 'TSV', 'TypeScript', 'UI', 'URI',
  'URL', 'URLs', 'UUID', 'Vercel', 'Webhook', 'Webhooks', 'WebSocket', 'XML',
  'YouTube', 'TikTok', 'Slack', 'Twilio', 'Docker', 'Kubernetes', 'npm', 'pnpm',
])

export function normalizeUiCopy(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

export function placeholderTokens(value) {
  const patterns = [
    /\{\{[^{}]+\}\}/g,
    /\$\{[^{}]+\}/g,
    /\{[^{}]+\}/g,
    /%(?:\d+\$)?[sdif]/g,
    /https?:\/\/[^\s)\]}]+/g,
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,
    /`[^`]+`/g,
  ]
  const out = []
  for (const pattern of patterns) {
    for (const match of String(value).matchAll(pattern)) out.push(match[0])
  }
  return out.sort()
}

function words(value) {
  return normalizeUiCopy(value).match(/[A-Za-z][A-Za-z0-9.+#-]*/g) || []
}

export function shouldTranslateUiCopy(value) {
  const text = normalizeUiCopy(value)
  if (!text || !/[A-Za-z]{2,}/.test(text)) return false
  if (/^(?:https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/)/i.test(text)) return false
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(text)) return false
  if (/^[a-z][A-Za-z0-9]*(?:[A-Z][A-Za-z0-9]*)+$/.test(text)) return false
  if (/^[A-Za-z0-9]+(?:[_:/\\.-][A-Za-z0-9]+)+$/.test(text) && !/\s/.test(text)) return false
  if (/^[a-f0-9]{8,}$/i.test(text)) return false

  const tokens = words(text)
  if (tokens.length && tokens.every(token => PROTECTED_TERMS.has(token))) return false
  return true
}
