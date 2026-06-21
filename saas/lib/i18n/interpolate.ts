// saas/lib/i18n/interpolate.ts
//
// Token interpolation for translated strings. Our t() returns a static string
// with no built-in substitution, so translatable templates use {param} tokens
// and callers run the result through interpolate() to inject runtime values:
//
//   interpolate(
//     t('audit.finding.staleIdentity.detail',
//       'No recorded activity for {days} days (threshold {threshold}).'),
//     { days: 200, threshold: 90 },
//   )
//
// A missing param is left as its literal {token} so gaps are visible in QA
// rather than silently dropped.

export type InterpolationParams = Record<string, string | number | undefined | null>

export function interpolate(template: string, params?: InterpolationParams): string {
  if (!template) return ''
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const v = params[key]
    return v === undefined || v === null ? match : String(v)
  })
}
