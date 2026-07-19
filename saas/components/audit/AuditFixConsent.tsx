'use client'

// saas/components/audit/AuditFixConsent.tsx
// Explicit post-audit consent boundary shared by repository scans and live
// readiness reports. Choosing Yes is the single final approval for the run.
// The parent workflow applies only repository PR fixes; production remains untouched.

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
    body: 'Actionable issues found: {count}. Choosing Yes is final approval to prepare and apply every safe repository fix in this run. Each fix is logged and proposed through a pull request; production resources do not change.',
    yes: 'Yes — prepare fixes',
    no: 'Not now',
  },
  es: {
    question: '¿Quieres que SignalBoost AI prepare correcciones para estos problemas?',
    body: 'Problemas que se pueden corregir: {count}. Al elegir Sí, das la aprobación final para preparar y aplicar todas las correcciones seguras del repositorio. Cada corrección queda registrada y se propone mediante un pull request; los recursos de producción no cambian.',
    yes: 'Sí — preparar correcciones',
    no: 'Ahora no',
  },
  pt: {
    question: 'Você quer que a SignalBoost AI prepare correções para estes problemas?',
    body: 'Problemas que podem ser corrigidos: {count}. Ao escolher Sim, você dá a aprovação final para preparar e aplicar todas as correções seguras do repositório. Cada correção é registrada e proposta por pull request; os recursos de produção não mudam.',
    yes: 'Sim — preparar correções',
    no: 'Agora não',
  },
  pl: {
    question: 'Czy chcesz, aby SignalBoost AI przygotowała poprawki do tych problemów?',
    body: 'Liczba problemów możliwych do naprawienia: {count}. Wybranie Tak jest ostateczną zgodą na przygotowanie i zastosowanie wszystkich bezpiecznych poprawek repozytorium. Każda poprawka jest rejestrowana i proponowana w pull requeście; zasoby produkcyjne nie są zmieniane.',
    yes: 'Tak — przygotuj poprawki',
    no: 'Nie teraz',
  },
  ru: {
    question: 'Хотите, чтобы SignalBoost AI подготовил исправления для этих проблем?',
    body: 'Количество проблем, которые можно исправить: {count}. Выбор «Да» является окончательным одобрением подготовки и применения всех безопасных исправлений репозитория. Каждое исправление журналируется и предлагается через pull request; производственные ресурсы не изменяются.',
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
