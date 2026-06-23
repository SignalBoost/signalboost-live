'use client'

// saas/components/audit/RemediationBanner.tsx
// Post-audit "Ready to Remediate" notification card. Shown by /dashboard/audit
// the moment a scan completes with findings. Self-contained: owns its own 5-locale
// copy so the parent page only passes { count, lang }. Linear tokens
// (bg-surface / border-border / text-text-muted) + gold premium accent (text-accent).
//
// The card explicitly promises NO autonomous writes — fixes wait for the per-finding
// "🚀 Confirm & Push Pull Request" handshake inside each finding drawer (PatchPreview).
// Its primary button smooth-scrolls to the findings list (default id: 'audit-findings').

type BannerCopy = { header: string; body: string; cta: string }

const COPY: Record<string, BannerCopy> = {
  en: {
    header: '✨ SignalBoost COS: Ready to Remediate',
    body: 'I have mapped out the architectural fixes for your {count} {findings}. No code will be touched without your explicit permission. Click any finding below to inspect the proposed diff and open a secure Pull Request.',
    cta: 'Review Remediation Roadmap',
  },
  es: {
    header: '✨ SignalBoost COS: Listo para Remediar',
    body: 'He trazado las correcciones arquitectónicas para tus {count} {findings}. No se tocará ningún código sin tu permiso explícito. Haz clic en cualquier hallazgo para inspeccionar el diff propuesto y abrir un Pull Request seguro.',
    cta: 'Revisar hoja de ruta de remediación',
  },
  pt: {
    header: '✨ SignalBoost COS: Pronto para Remediar',
    body: 'Mapeei as correções arquitetônicas para suas {count} {findings}. Nenhum código será alterado sem a sua permissão explícita. Clique em qualquer constatação abaixo para inspecionar o diff proposto e abrir um Pull Request seguro.',
    cta: 'Revisar roteiro de remediação',
  },
  pl: {
    header: '✨ SignalBoost COS: Gotowy do naprawy',
    body: 'Opracowałem architektoniczne poprawki dla Twoich {count} {findings}. Żaden kod nie zostanie zmieniony bez Twojej wyraźnej zgody. Kliknij dowolny wynik poniżej, aby sprawdzić proponowaną różnicę i otworzyć bezpieczny Pull Request.',
    cta: 'Przejrzyj plan naprawy',
  },
  ru: {
    header: '✨ SignalBoost COS: Готов к устранению',
    body: 'Я наметил архитектурные исправления для ваших {count} {findings}. Ни одна строка кода не будет изменена без вашего явного разрешения. Нажмите на любое замечание ниже, чтобы изучить предлагаемый diff и открыть безопасный Pull Request.',
    cta: 'Просмотреть план устранения',
  },
}

// Localized, count-aware noun so "1 vulnerability" / "2 vulnerabilities" both read right.
function findingsNoun(lang: string, count: number): string {
  const one = count === 1
  switch (lang) {
    case 'es': return one ? 'vulnerabilidad' : 'vulnerabilidades'
    case 'pt': return one ? 'vulnerabilidade' : 'vulnerabilidades'
    case 'pl': return one ? 'lukę' : 'luk(i) w zabezpieczeniach'
    case 'ru': return one ? 'уязвимости' : 'уязвимостей'
    default:   return one ? 'vulnerability' : 'vulnerabilities'
  }
}

export default function RemediationBanner({
  count,
  lang = 'en',
  targetId = 'audit-findings',
}: {
  count: number
  lang?: string
  targetId?: string
}) {
  const copy = COPY[lang] || COPY.en
  const body = copy.body
    .replace('{count}', String(count))
    .replace('{findings}', findingsNoun(lang, count))

  const scrollToFindings = () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(targetId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="mt-4 overflow-hidden rounded-md border border-accent/40 bg-surface/50 p-4 ring-1 ring-accent/15 backdrop-blur-sm"
      style={{ borderLeft: '3px solid var(--sb-accent, #ffc300)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight text-text">{copy.header}</h3>
          </div>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-relaxed text-text-muted">{body}</p>
        </div>

        <button
          onClick={scrollToFindings}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-center whitespace-nowrap rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110"
        >
          {copy.cta}
          <span aria-hidden>↓</span>
        </button>
      </div>
    </div>
  )
}
