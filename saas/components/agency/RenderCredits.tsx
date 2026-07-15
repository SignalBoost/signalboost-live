'use client'

// saas/components/agency/RenderCredits.tsx
// Render-credit balance + one-time top-up packs for cinematic production.
// Mirrors the audit credit-pack UI (AuditDashboard): fathom-glass card, pack
// tiles, Supabase-authed startTopup POST to /api/stripe/render-topup. The client
// sends ONLY the pack id; the server fixes the credit amount.

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const PACKS: { id: 'small' | 'medium' | 'large'; credits: number; popular?: boolean }[] = [
  { id: 'small', credits: 1500 },
  { id: 'medium', credits: 4500, popular: true },
  { id: 'large', credits: 15000 },
]

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  title: string
  subtitle: string
  balanceLabel: string
  creditsWord: string
  buyCta: string
  redirecting: string
  buyError: string
  popular: string
  signedOut: string
}> = {
  en: {
    title: 'Render credits',
    subtitle: 'Prepaid credits power cinematic production. Top up once, spend only what each render uses — nothing is charged until you produce.',
    balanceLabel: 'Your balance',
    creditsWord: 'credits',
    buyCta: 'Buy',
    redirecting: 'Redirecting…',
    buyError: 'Could not start checkout.',
    popular: 'Popular',
    signedOut: 'Sign in to view your balance and top up render credits.',
  },
  es: {
    title: 'Créditos de render',
    subtitle: 'Los créditos prepagos impulsan la producción cinematográfica. Recarga una vez y paga solo lo que usa cada render — no se cobra nada hasta que produces.',
    balanceLabel: 'Tu saldo',
    creditsWord: 'créditos',
    buyCta: 'Comprar',
    redirecting: 'Redirigiendo…',
    buyError: 'No se pudo iniciar el pago.',
    popular: 'Popular',
    signedOut: 'Inicia sesión para ver tu saldo y recargar créditos de render.',
  },
  pt: {
    title: 'Créditos de render',
    subtitle: 'Créditos pré-pagos alimentam a produção cinematográfica. Recarregue uma vez e pague apenas o que cada render usa — nada é cobrado até você produzir.',
    balanceLabel: 'Seu saldo',
    creditsWord: 'créditos',
    buyCta: 'Comprar',
    redirecting: 'Redirecionando…',
    buyError: 'Não foi possível iniciar o pagamento.',
    popular: 'Popular',
    signedOut: 'Faça login para ver seu saldo e recarregar créditos de render.',
  },
  pl: {
    title: 'Kredyty renderowania',
    subtitle: 'Przedpłacone kredyty napędzają produkcję kinową. Doładuj raz i płać tylko za to, co zużywa każdy render — nic nie jest pobierane, dopóki nie wyprodukujesz.',
    balanceLabel: 'Twoje saldo',
    creditsWord: 'kredytów',
    buyCta: 'Kup',
    redirecting: 'Przekierowanie…',
    buyError: 'Nie udało się rozpocząć płatności.',
    popular: 'Popularne',
    signedOut: 'Zaloguj się, aby zobaczyć saldo i doładować kredyty renderowania.',
  },
  ru: {
    title: 'Кредиты рендеринга',
    subtitle: 'Предоплаченные кредиты обеспечивают кинематографическое производство. Пополните один раз и платите только за то, что использует каждый рендер — ничего не списывается, пока вы не начнёте производство.',
    balanceLabel: 'Ваш баланс',
    creditsWord: 'кредитов',
    buyCta: 'Купить',
    redirecting: 'Перенаправление…',
    buyError: 'Не удалось начать оплату.',
    popular: 'Популярный',
    signedOut: 'Войдите, чтобы увидеть баланс и пополнить кредиты рендеринга.',
  },
}

export default function RenderCredits() {
  const { lang } = useI18n()
  const copy = COPY[(['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang]

  const [signedIn, setSignedIn] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/agency/render-credits', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!live || !data) return
        setSignedIn(Boolean(data.signedIn))
        setBalance(Number(data.balance) || 0)
      } catch {
        // balance unavailable — packs still purchasable
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  async function startTopup(pack: string) {
    setBuying(pack)
    setBuyError(null)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe/render-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ pack }),
      })
      const data = await res.json().catch(() => null)
      if (data?.url) { window.location.href = data.url }
      else { setBuyError(data?.error || copy.buyError); setBuying(null) }
    } catch {
      setBuyError(copy.buyError)
      setBuying(null)
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title}>
      <div className="sb-glass" style={{ padding: 28, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span className="sb-eyebrow">{copy.title}</span>
            <p className="sb-body" style={{ margin: '6px 0 0', maxWidth: 620, fontSize: 13 }}>{copy.subtitle}</p>
          </div>
          {signedIn && balance !== null ? (
            <div style={{ textAlign: 'right' }}>
              <div className="sb-caption">{copy.balanceLabel}</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 28, fontWeight: 900, color: '#1af0ff' }}>
                {balance.toLocaleString()}
              </div>
              <div className="sb-caption">{copy.creditsWord}</div>
            </div>
          ) : null}
        </div>

        {!loading && !signedIn ? (
          <p className="sb-body" style={{ margin: 0, color: '#fbbf24', fontSize: 13 }}>{copy.signedOut}</p>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {PACKS.map((pk) => {
            const busy = buying === pk.id
            return (
              <div
                key={pk.id}
                style={{
                  flex: '1 1 200px',
                  minWidth: 180,
                  borderRadius: 14,
                  border: pk.popular ? '1px solid rgba(255,195,0,.45)' : '1px solid rgba(255,255,255,.12)',
                  background: pk.popular ? 'rgba(255,195,0,.06)' : 'rgba(255,255,255,.03)',
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 900, color: '#fff' }}>
                    {pk.credits.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>{copy.creditsWord}</span>
                  {pk.popular ? (
                    <span style={{ marginLeft: 'auto', borderRadius: 999, border: '1px solid rgba(255,195,0,.4)', padding: '2px 8px', fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#ffc300' }}>
                      {copy.popular}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => startTopup(pk.id)}
                  disabled={busy}
                  className={pk.popular ? 'sb-button-primary' : 'sb-button-secondary'}
                  style={{ width: '100%', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? copy.redirecting : `${copy.buyCta} ${pk.credits.toLocaleString()} ${copy.creditsWord}`}
                </button>
              </div>
            )
          })}
        </div>

        {buyError ? <div style={{ fontSize: 12, color: '#fca5a5' }}>{buyError}</div> : null}
      </div>
    </section>
  )
}
