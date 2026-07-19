'use client'

// saas/components/audit/AuditFixConsent.tsx
// Explicit post-audit consent boundary shared by repository scans and live
// readiness reports. Choosing Yes prepares or opens a remediation plan only.
// This component never calls a provider, writes code, or changes production.

import { useId, useState } from 'react'

type ConsentCopy = {
  question: string
  body: string
  yes: string
  no: string
}

const COPY: Record<string, ConsentCopy> = {
  en: {
    question: 'Would you like SignalBoost AI to prepare fixes for these issues?',
    body: 'Actionable issues found: {count}. Choosing Yes prepares a remediation plan only. No code, provider setting, or production resource will change until you review and approve the exact change.',
    yes: 'Yes — prepare fixes',
    no: 'Not now',
  },
  es: {
    question: '¿Quieres que SignalBoost AI prepare correcciones para estos problemas?',
    body: 'Problemas que se pueden corregir: {count}. Al elegir Sí, solo se prepara un plan de corrección. No se cambiará código, configuración de proveedores ni recursos de producción hasta que revises y apruebes el cambio exacto.',
    yes: 'Sí — preparar correcciones',
    no: 'Ahora no',
  },
  pt: {
    question: 'Você quer que a SignalBoost AI prepare correções para estes problemas?',
    body: 'Problemas que podem ser corrigidos: {count}. Ao escolher Sim, somente um plano de correção será preparado. Nenhum código, configuração de provedor ou recurso de produção será alterado até você revisar e aprovar a mudança exata.',
    yes: 'Sim — preparar correções',
    no: 'Agora não',
  },
  pl: {
    question: 'Czy chcesz, aby SignalBoost AI przygotowała poprawki do tych problemów?',
    body: 'Liczba problemów możliwych do naprawienia: {count}. Wybranie Tak przygotuje tylko plan naprawy. Kod, ustawienia dostawców ani zasoby produkcyjne nie zostaną zmienione, dopóki nie sprawdzisz i nie zatwierdzisz dokładnej zmiany.',
    yes: 'Tak — przygotuj poprawki',
    no: 'Nie teraz',
  },
  ru: {
    question: 'Хотите, чтобы SignalBoost AI подготовил исправления для этих проблем?',
    body: 'Количество проблем, которые можно исправить: {count}. При выборе «Да» будет подготовлен только план исправления. Код, настройки провайдеров и производственные ресурсы не изменятся, пока вы не проверите и не одобрите точное изменение.',
    yes: 'Да — подготовить исправления',
    no: 'Не сейчас',
  },
}

export default function AuditFixConsent({
  count,
  lang = 'en',
  onAccept,
  acceptHref,
}: {
  count: number
  lang?: string
  onAccept?: () => void
  acceptHref?: string
}) {
  const [dismissed, setDismissed] = useState(false)
  const titleId = useId()
  if (dismissed || count <= 0) return null

  const copy = COPY[lang] || COPY.en
  const body = copy.body.replace('{count}', String(count))
  const acceptClass = 'inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <section
      className="mb-4 overflow-hidden rounded-md border border-accent/40 bg-surface/50 p-4 ring-1 ring-accent/15 backdrop-blur-sm"
      style={{ borderLeft: '3px solid var(--sb-accent, #ffc300)' }}
      aria-labelledby={titleId}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <h3 id={titleId} className="text-sm font-semibold tracking-tight text-text">
              {copy.question}
            </h3>
          </div>
          <p className="mt-1.5 max-w-[760px] text-[12.5px] leading-relaxed text-text-muted">{body}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">
          {acceptHref ? (
            <a href={acceptHref} className={acceptClass}>
              {copy.yes}
            </a>
          ) : (
            <button type="button" onClick={onAccept} disabled={!onAccept} className={acceptClass}>
              {copy.yes}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center justify-center rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold text-text-muted transition-fast hover:border-accent hover:text-text"
          >
            {copy.no}
          </button>
        </div>
      </div>
    </section>
  )
}
