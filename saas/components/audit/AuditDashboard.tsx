'use client'

// saas/components/audit/AuditDashboard.tsx
// Premium fathom-glass workspace dashboard for the Audit Project.
// Task 1: layout + 5-language i18n + live credit-usage limits (from /api/credits).
// Task 2: Stripe upgrade-path triggers (POST /api/checkout → redirect), matching
// the proven pricing-page flow.
// Task 3: one-time credit-pack top-ups (POST /api/stripe/audit-topup → redirect).
// Styling: meters + upgrade path use inline styles (original); the Buy-credits
// section uses Tailwind utilities for the fathom-glass look — Tailwind IS active
// in this repo. Fully fluid heights with maxHeight scroll caps.

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const RED = '#fca5a5'
const ORANGE = '#fb923c'
const UNLIMITED = 100000 // owner/admin allowances come back as 999999

// Credit packs offered by the "Buy credits" picker. The id is all the client
// sends to /api/stripe/audit-topup; the server fixes the real credit amount, so
// these counts are display-only and MUST stay in sync with TOPUP_PACKS in
// saas/app/api/stripe/audit-topup/route.ts.
const PACKS: { id: 'small' | 'medium' | 'large'; credits: number; popular?: boolean }[] = [
  { id: 'small',  credits: 50 },
  { id: 'medium', credits: 150, popular: true },
  { id: 'large',  credits: 500 },
]

type Meter = 'video' | 'image' | 'ai'
type CreditInfo = {
  plan: string
  isOwner?: boolean
  isAdmin?: boolean
  video?: number; image?: number; ai?: number
  allowances?: { video: number; image: number; ai: number }
}

// Public plan ladder (matches /api/checkout public names: launch/growth/command).
const PLAN_ORDER = ['free', 'launch', 'growth', 'command']

type AuditCopy = {
  title: string; subtitle: string
  creditUsage: string; currentPlan: string; unlimited: string
  meterVideo: string; meterImage: string; meterAi: string; usedOf: string
  upgradeTitle: string; upgradeSubtitle: string; upgrade: string; redirecting: string; upgradeError: string
  buyTitle: string; buySubtitle: string; buyCta: string; creditsWord: string; buyError: string
  loading: string; loadError: string; popular: string
  plan: Record<string, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: 'Audit Workspace', subtitle: 'Run deep audits, track usage, and scale your plan.',
    creditUsage: 'Credit usage', currentPlan: 'Current plan', unlimited: 'Unlimited',
    meterVideo: 'Video', meterImage: 'Image', meterAi: 'AI', usedOf: 'used of',
    upgradeTitle: 'Scale up', upgradeSubtitle: 'More credits, deeper audits, higher limits.', upgrade: 'Upgrade to', redirecting: 'Redirecting…', upgradeError: 'Could not start checkout.',
    buyTitle: 'Buy audit credits', buySubtitle: 'One-time credit packs — added to your balance right after checkout.', buyCta: 'Buy', creditsWord: 'credits', buyError: 'Could not start checkout.',
    loading: 'Loading usage…', loadError: 'Could not load usage.', popular: 'Most popular',
    plan: { free: 'Free Demo', launch: 'Launch', growth: 'Growth', command: 'Command' },
  },
  es: {
    title: 'Espacio de Auditoría', subtitle: 'Ejecuta auditorías profundas, controla el uso y amplía tu plan.',
    creditUsage: 'Uso de créditos', currentPlan: 'Plan actual', unlimited: 'Ilimitado',
    meterVideo: 'Video', meterImage: 'Imagen', meterAi: 'IA', usedOf: 'usados de',
    upgradeTitle: 'Amplía tu plan', upgradeSubtitle: 'Más créditos, auditorías más profundas, límites mayores.', upgrade: 'Mejorar a', redirecting: 'Redirigiendo…', upgradeError: 'No se pudo iniciar el pago.',
    buyTitle: 'Comprar créditos de auditoría', buySubtitle: 'Paquetes de créditos de pago único — se suman a tu saldo justo después del pago.', buyCta: 'Comprar', creditsWord: 'créditos', buyError: 'No se pudo iniciar el pago.',
    loading: 'Cargando uso…', loadError: 'No se pudo cargar el uso.', popular: 'Más popular',
    plan: { free: 'Demo gratis', launch: 'Launch', growth: 'Growth', command: 'Command' },
  },
  pt: {
    title: 'Espaço de Auditoria', subtitle: 'Execute auditorias profundas, acompanhe o uso e amplie seu plano.',
    creditUsage: 'Uso de créditos', currentPlan: 'Plano atual', unlimited: 'Ilimitado',
    meterVideo: 'Vídeo', meterImage: 'Imagem', meterAi: 'IA', usedOf: 'usados de',
    upgradeTitle: 'Amplie seu plano', upgradeSubtitle: 'Mais créditos, auditorias mais profundas, limites maiores.', upgrade: 'Atualizar para', redirecting: 'Redirecionando…', upgradeError: 'Não foi possível iniciar o pagamento.',
    buyTitle: 'Comprar créditos de auditoria', buySubtitle: 'Pacotes de créditos avulsos — adicionados ao seu saldo logo após o pagamento.', buyCta: 'Comprar', creditsWord: 'créditos', buyError: 'Não foi possível iniciar o pagamento.',
    loading: 'Carregando uso…', loadError: 'Não foi possível carregar o uso.', popular: 'Mais popular',
    plan: { free: 'Demo grátis', launch: 'Launch', growth: 'Growth', command: 'Command' },
  },
  pl: {
    title: 'Przestrzeń Audytu', subtitle: 'Uruchamiaj dogłębne audyty, śledź zużycie i rozwijaj swój plan.',
    creditUsage: 'Zużycie kredytów', currentPlan: 'Bieżący plan', unlimited: 'Bez limitu',
    meterVideo: 'Wideo', meterImage: 'Obraz', meterAi: 'AI', usedOf: 'wykorzystano z',
    upgradeTitle: 'Rozwiń plan', upgradeSubtitle: 'Więcej kredytów, głębsze audyty, wyższe limity.', upgrade: 'Przejdź na', redirecting: 'Przekierowanie…', upgradeError: 'Nie udało się rozpocząć płatności.',
    buyTitle: 'Kup kredyty audytu', buySubtitle: 'Jednorazowe pakiety kredytów — dodawane do salda zaraz po płatności.', buyCta: 'Kup', creditsWord: 'kredytów', buyError: 'Nie udało się rozpocząć płatności.',
    loading: 'Ładowanie zużycia…', loadError: 'Nie udało się wczytać zużycia.', popular: 'Najpopularniejszy',
    plan: { free: 'Darmowe demo', launch: 'Launch', growth: 'Growth', command: 'Command' },
  },
  ru: {
    title: 'Рабочее пространство аудита', subtitle: 'Запускайте глубокие аудиты, отслеживайте расход и расширяйте тариф.',
    creditUsage: 'Использование кредитов', currentPlan: 'Текущий тариф', unlimited: 'Безлимит',
    meterVideo: 'Видео', meterImage: 'Изображения', meterAi: 'ИИ', usedOf: 'использовано из',
    upgradeTitle: 'Расширить тариф', upgradeSubtitle: 'Больше кредитов, глубже аудиты, выше лимиты.', upgrade: 'Перейти на', redirecting: 'Перенаправление…', upgradeError: 'Не удалось начать оплату.',
    buyTitle: 'Купить кредиты аудита', buySubtitle: 'Разовые пакеты кредитов — зачисляются на баланс сразу после оплаты.', buyCta: 'Купить', creditsWord: 'кредитов', buyError: 'Не удалось начать оплату.',
    loading: 'Загрузка данных…', loadError: 'Не удалось загрузить данные.', popular: 'Популярный',
    plan: { free: 'Бесплатное демо', launch: 'Launch', growth: 'Growth', command: 'Command' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

const glass: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}

function planName(copy: AuditCopy, plan: string): string { return copy.plan[plan] || plan }

function MeterBar({ label, used, total, copy }: { label: string; used: number; total: number; copy: AuditCopy }) {
  const unlimited = total >= UNLIMITED
  const pct = unlimited || total <= 0 ? 0 : Math.min((used / total) * 100, 100)
  const color = pct >= 100 ? RED : pct >= 80 ? ORANGE : GOLD
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {unlimited ? copy.unlimited : `${used} ${copy.usedOf} ${total}`}
        </span>
      </div>
      <div style={{ height: 8, width: '100%', borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: unlimited ? '100%' : `${pct}%`, background: unlimited ? `linear-gradient(90deg, ${CYAN}, ${GOLD})` : color, borderRadius: 999, transition: 'width .3s ease' }} />
      </div>
    </div>
  )
}

export default function AuditDashboard() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [info, setInfo] = useState<CreditInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [upError, setUpError] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/credits', { credentials: 'include' })
        const data = await res.json().catch(() => null)
        if (!alive) return
        if (!data) { setLoadError(true) } else { setInfo(data as CreditInfo) }
      } catch {
        if (alive) setLoadError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  async function startUpgrade(plan: string) {
    setUpgrading(plan); setUpError(null)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => null)
      if (data?.url) { window.location.href = data.url }
      else { setUpError(data?.error || copy.upgradeError); setUpgrading(null) }
    } catch {
      setUpError(copy.upgradeError); setUpgrading(null)
    }
  }

  async function startTopup(pack: string) {
    setBuying(pack); setBuyError(null)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe/audit-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ pack }),
      })
      const data = await res.json().catch(() => null)
      if (data?.url) { window.location.href = data.url }
      else { setBuyError(data?.error || copy.buyError); setBuying(null) }
    } catch {
      setBuyError(copy.buyError); setBuying(null)
    }
  }

  const plan = info?.plan || 'free'
  const privileged = !!(info?.isOwner || info?.isAdmin)
  const allow = info?.allowances || { video: 0, image: 0, ai: 0 }
  const meters: { key: Meter; label: string }[] = [
    { key: 'video', label: copy.meterVideo },
    { key: 'image', label: copy.meterImage },
    { key: 'ai', label: copy.meterAi },
  ]
  const usedOf = (m: Meter) => {
    const total = allow[m] || 0
    const remaining = (info?.[m] as number) ?? 0
    return { used: Math.max(0, total - remaining), total }
  }

  // Upgrade targets: plans strictly above the current one. None for owner/admin or Command.
  const curIdx = PLAN_ORDER.indexOf(plan)
  const upgradeTargets = privileged ? [] : PLAN_ORDER.slice(Math.max(curIdx + 1, 1)).filter(p => p !== 'free')

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{copy.title} <span style={{ color: GOLD }}>·</span></h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>{copy.subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Credit usage */}
        <section style={{ ...glass, flex: '1 1 360px', minWidth: 300, padding: 20, height: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.creditUsage}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0a0e17', background: GOLD, borderRadius: 999, padding: '3px 12px' }}>{planName(copy, plan)}</span>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>{copy.loading}</div>
          ) : loadError ? (
            <div style={{ fontSize: 13, color: RED }}>{copy.loadError}</div>
          ) : (
            meters.map(m => { const u = usedOf(m.key); return <MeterBar key={m.key} label={m.label} used={u.used} total={u.total} copy={copy} /> })
          )}
        </section>

        {/* Upgrade path */}
        {!loading && !loadError && upgradeTargets.length > 0 && (
          <section style={{ ...glass, flex: '1 1 320px', minWidth: 280, padding: 20, height: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 4 }}>{copy.upgradeTitle}</div>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.5 }}>{copy.upgradeSubtitle}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upgradeTargets.map(target => {
                const isPopular = target === 'growth'
                const busy = upgrading === target
                return (
                  <div key={target} style={{ border: `1px solid ${isPopular ? 'rgba(255,195,0,.45)' : 'rgba(255,255,255,.12)'}`, borderRadius: 12, padding: 14, background: isPopular ? 'rgba(255,195,0,.06)' : 'rgba(255,255,255,.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{planName(copy, target)}</span>
                      {isPopular && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: GOLD, border: `1px solid ${GOLD}66`, borderRadius: 999, padding: '2px 8px' }}>{copy.popular}</span>}
                    </div>
                    <button
                      onClick={() => startUpgrade(target)}
                      disabled={busy}
                      style={{
                        width: '100%', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 800,
                        cursor: busy ? 'default' : 'pointer',
                        color: isPopular ? '#0a0e17' : CYAN,
                        background: isPopular ? (busy ? 'rgba(255,195,0,.3)' : 'linear-gradient(135deg, #ffc300, #ffb000)') : 'transparent',
                        border: `1px solid ${isPopular ? 'rgba(255,195,0,.5)' : 'rgba(26,240,255,.4)'}`,
                      }}
                    >
                      {busy ? copy.redirecting : `${copy.upgrade} ${planName(copy, target)}`}
                    </button>
                  </div>
                )
              })}
            </div>

            {upError && <div style={{ marginTop: 12, fontSize: 12, color: RED }}>{upError}</div>}
          </section>
        )}
      </div>

      {/* Buy credits — one-time top-up packs (Tailwind / fathom-glass) */}
      {!loading && !loadError && !privileged && (
        <section className="mt-4 rounded-2xl border border-white/10 p-5 backdrop-blur-lg [background:linear-gradient(160deg,rgba(15,23,42,0.55),rgba(7,11,20,0.65))]">
          <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-white/50">{copy.buyTitle}</div>
          <p className="mb-3.5 mt-0 max-w-[560px] text-[12.5px] leading-relaxed text-white/60">{copy.buySubtitle}</p>

          <div className="flex flex-wrap gap-3">
            {PACKS.map(pk => {
              const busy = buying === pk.id
              return (
                <div
                  key={pk.id}
                  className={`flex-1 basis-[200px] min-w-[180px] rounded-xl border p-4 ${pk.popular ? 'border-[#ffc300]/45 bg-[#ffc300]/[0.06]' : 'border-white/[0.12] bg-white/[0.03]'}`}
                >
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="font-mono text-[22px] font-extrabold text-white">{pk.credits}</span>
                    <span className="text-xs font-bold text-white/60">{copy.creditsWord}</span>
                    {pk.popular && (
                      <span className="ml-auto rounded-full border border-[#ffc300]/40 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-[#ffc300]">
                        {copy.popular}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => startTopup(pk.id)}
                    disabled={busy}
                    className={`w-full rounded-[10px] px-4 py-2.5 text-[13px] font-extrabold transition disabled:cursor-default ${
                      pk.popular
                        ? `border border-[#ffc300]/50 text-[#0a0e17] ${busy ? 'bg-[#ffc300]/30' : 'bg-gradient-to-br from-[#ffc300] to-[#ffb000]'}`
                        : 'border border-[#1af0ff]/40 bg-transparent text-[#1af0ff]'
                    }`}
                  >
                    {busy ? copy.redirecting : `${copy.buyCta} ${pk.credits} ${copy.creditsWord}`}
                  </button>
                </div>
              )
            })}
          </div>

          {buyError && <div className="mt-3 text-xs text-red-300">{buyError}</div>}
        </section>
      )}
    </main>
  )
}
