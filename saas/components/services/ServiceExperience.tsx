'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import type { ServiceCatalogItem } from '@/lib/services/catalog'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'

const panelStyle = {
  border: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(255,255,255,.045)',
  borderRadius: 22,
  padding: 18,
} as const

type ServiceExperienceProps = {
  service: ServiceCatalogItem
  mode?: 'dashboard' | 'landing'
}

export default function ServiceExperience({ service, mode = 'dashboard' }: ServiceExperienceProps) {
  const { dict } = useI18n()
  const [brief, setBrief] = useState('')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const title = t(dict, `services.${service.key}.title`, service.titleFallback)
  const description = t(dict, `services.${service.key}.desc`, service.descFallback)
  const cta = t(dict, `services.${service.key}.cta`, service.ctaFallback)

  const steps = useMemo(() => [1, 2, 3].map((step) => t(dict, `services.${service.key}.workflow.${step}`, [
    'Add the source material or URL.',
    'Review AI suggestions and adjust the brief.',
    'Generate results, approve, and launch.',
  ][step - 1])), [dict, service.key])

  const suggestions = useMemo(() => [1, 2, 3].map((item) => t(dict, `services.${service.key}.suggestions.${item}`, [
    'Use one clear audience and one measurable goal.',
    'Localize the tone for English, Spanish, Portuguese, Polish, and Russian users.',
    'Keep the first CTA visible and repeat it near the result.',
  ][item - 1])), [dict, service.key])

  const results = useMemo(() => [1, 2, 3].map((item) => t(dict, `services.${service.key}.results.${item}`, [
    'Prioritized action checklist',
    'Localized copy and content blocks',
    'Launch-ready next steps',
  ][item - 1])), [dict, service.key])

  return (
    <main className="sb-page-shell sb-section">
      <section className="sb-glass" style={{ padding: 28, marginBottom: 22 }}>
        <span className="sb-eyebrow">{t(dict, 'services.kicker', 'SignalBoost service')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 20, alignItems: 'center' }}>
          <div>
            <h1 className="sb-h1" style={{ marginTop: 10 }}><span aria-hidden="true">{service.icon}</span> {title}</h1>
            <p className="sb-body" style={{ maxWidth: 780 }}>{description}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href={service.dashboardHref}>{cta}</Link>
            <Link className="sb-button-secondary" href="/pricing#saas-modules">{t(dict, 'services.comparePricing', 'Compare pricing')}</Link>
          </div>
        </div>
      </section>

      <OrchestrationPanel module={service.key} compact />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
        <article style={panelStyle}>
          <span className="sb-eyebrow">{t(dict, 'services.workflow', 'Guided workflow')}</span>
          <ol className="sb-body" style={{ paddingLeft: 20, display: 'grid', gap: 10 }}>
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </article>

        <article style={panelStyle}>
          <span className="sb-eyebrow">{t(dict, 'services.inputs', 'Inputs')}</span>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {(service.inputType === 'url' || service.inputType === 'upload-url') && (
              <label className="sb-caption" style={{ display: 'grid', gap: 6 }}>
                {t(dict, 'services.urlInput', 'URL input')}
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#fff', padding: 12 }} />
              </label>
            )}
            {(service.inputType === 'upload' || service.inputType === 'upload-url') && (
              <label className="sb-caption" style={{ display: 'grid', gap: 6 }}>
                {t(dict, 'services.uploadInput', 'Upload input')}
                <input type="file" onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} />
                {fileName && <span>{fileName}</span>}
              </label>
            )}
            <label className="sb-caption" style={{ display: 'grid', gap: 6 }}>
              {t(dict, 'services.briefInput', 'Brief')}
              <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={5} placeholder={t(dict, 'services.briefPlaceholder', 'Describe the goal, audience, offer, and preferred tone.')} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#fff', padding: 12 }} />
            </label>
          </div>
        </article>

        <article style={panelStyle}>
          <span className="sb-eyebrow">{t(dict, 'services.aiSuggestions', 'AI suggestions')}</span>
          <ul className="sb-body" style={{ paddingLeft: 18, display: 'grid', gap: 10 }}>
            {suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
          </ul>
        </article>
      </section>

      <section className="sb-card" style={{ marginTop: 16, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'services.resultsPanel', 'Results panel')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'services.resultsTitle', 'What SignalBoost prepares')}</h2>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href={service.dashboardHref}>{mode === 'landing' ? cta : t(dict, 'services.generateResults', 'Generate results')}</Link>
            <Link className="sb-button-secondary" href={mode === 'dashboard' ? '/dashboard' : service.landingHref}>{t(dict, 'services.openAnotherWorkspace', 'Open another workspace')}</Link>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 16 }}>
          {results.map((result) => <div key={result} className="sb-glass" style={{ padding: 16, borderColor: `${service.accent}55` }}>✦ {result}</div>)}
        </div>
      </section>
    </main>
  )
}
