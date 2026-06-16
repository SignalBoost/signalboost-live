// saas/lib/i18n/consoleCopy.ts
//
// Hub Console i18n helpers. All console strings live in locales/console.*.json
// (loaded dynamically by loadLanguage and exposed under the "console" namespace).
// These helpers resolve them through the standard t(dict, key, fallback) loader,
// so the English string in the data is the final fallback and nothing renders blank.
//
// A buyer translates the console by editing locales/console.<lang>.json — no code.

import { t } from '@/lib/i18n/t'
import type { Dict } from '@/lib/i18n/loadLanguage'

/** "Pull Requests" -> "pull_requests" (stable key fragment for sec/sub/fld/opt). */
export function hubSlug(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Resolve a console chrome string from the loaded dict, English fallback. */
export function cHub(dict: Dict | null | undefined, key: string, fallback: string): string {
  return t(dict, key, fallback)
}

/** Provider clone with subtitle + section titles localized (name kept — brand). */
export function localizeProvider<T extends { id: string; subtitle?: string; sections?: { title: string; templateIds: string[] }[] }>(provider: T, dict: Dict | null | undefined): T {
  if (!provider || !dict) return provider
  const subtitle = provider.subtitle
    ? t(dict, `console.sub.${hubSlug(provider.subtitle)}`, provider.subtitle)
    : provider.subtitle
  const sections = (provider.sections || []).map(s => ({
    ...s,
    title: t(dict, `console.sec.${hubSlug(s.title)}`, t(dict, `console.sub.${hubSlug(s.title)}`, s.title)),
  }))
  return { ...provider, subtitle, sections }
}

/** Template clone with label, description, field labels + option labels localized. */
export function localizeTemplate<T extends { id: string; label?: string; description?: string; fields?: any[] }>(template: T, dict: Dict | null | undefined): T {
  if (!template || !dict) return template
  const label = template.label ? t(dict, `console.tpl.${template.id}.label`, template.label) : template.label
  const description = template.description ? t(dict, `console.tpl.${template.id}.desc`, template.description) : template.description
  const fields = (template.fields || []).map((f: any) => ({
    ...f,
    label: f?.label ? t(dict, `console.fld.${hubSlug(f.label)}`, f.label) : f?.label,
    options: Array.isArray(f?.options)
      ? f.options.map((o: any) => ({ ...o, label: o?.label ? t(dict, `console.opt.${hubSlug(o.label)}`, o.label) : o?.label }))
      : f?.options,
  }))
  return { ...template, label, description, fields }
}
