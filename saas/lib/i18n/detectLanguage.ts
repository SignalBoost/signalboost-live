export function detectLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language || 'en'
  return lang.startsWith('es') ? 'es' : 'en'
}
