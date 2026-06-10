'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type UsageUser = { email: string; plan: string; rawPlan: string; status: string | null; videoCredits: number | null; imageCredits: number | null; aiCredits: number | null; creditsResetAt: string | null; signedUpAt: string | null; lastSignInAt: string | null }
type UsageData = { users: UsageUser[]; planCounts: Record<string, number>; mrr: number; totalSubscriptions: number; totalAuthUsers: number }

const COPY = {
  eyebrow:      { en: 'Admin', es: 'Admin', pt: 'Admin', pl: 'Admin', ru: 'Админ' },
  title:        { en: 'Usage Dashboard', es: 'Panel de uso', pt: 'Painel de uso', pl: 'Panel uzycia', ru: 'Панель использования' },
  subtitle:     { en: 'Per-user credit consumption, plan distribution, and revenue signals.', es: 'Consumo de creditos por usuario, distribucion de planes y senales de ingresos.', pt: 'Consumo de creditos por usuario, distribuicao de planos e sinais de receita.', pl: 'Zuzycie kredytow, rozklad planow i sygnaly przychodow.', ru: 'Кредиты пользователей, распределение планов и доход.' },
  loading:      { en: 'Loading usage data...', es: 'Cargando datos...', pt: 'Carregando dados...', pl: 'Ladowanie danych...', ru: 'Загрузка данных...' },
  forbidden:    { en: 'Admin access required.', es: 'Se requiere acceso de administrador.', pt: 'Acesso de administrador necessario.', pl: 'Wymagany dostep administratora.', ru: 'Требуется доступ администратора.' },
  errorLabel:   { en: 'Could not load usage data:', es: 'No se pudieron cargar los datos:', pt: 'Nao foi possivel carregar os dados:', pl: 'Nie mozna zaladowac danych:', ru: 'Не удалось загрузить данные:' },
  mrr:          { en: 'Est. MRR', es: 'MRR est.', pt: 'MRR est.', pl: 'Szac. MRR', ru: 'Оцен. MRR' },
  subscribers:  { en: 'Subscriptions', es: 'Suscripciones', pt: 'Assinaturas', pl: 'Subskrypcje', ru: 'Подписки' },
  authUsers:    { en: 'Auth users', es: 'Usuarios', pt: 'Usuarios', pl: 'Uzytkownicy', ru: 'Пользователи' },
  paidUsers:    { en: 'Paid users', es: 'Usuarios de pago', pt: 'Usuarios pagos', pl: 'Platni uzytkownicy', ru: 'Платные' },
  planDist:     { en: 'Plan distribution', es: 'Distribucion de planes', pt: 'Distribuicao de planos', pl: 'Rozklad planow', ru: 'Распределение планов' },
  userTable:    { en: 'Per-user credits (remaining)', es: 'Creditos por usuario (restantes)', pt: 'Creditos por usuario (restantes)', pl: 'Kredyty na uzytkownika (pozostale)', ru: 'Кредиты по пользователям (остаток)' },
  colUser:      { en: 'User', es: 'Usuario', pt: 'Usuario', pl: 'Uzytkownik', ru: 'Пользователь' },
  colPlan:      { en: 'Plan', es: 'Plan', pt: 'Plano', pl: 'Plan', ru: 'План' },
  colVideo:     { en: 'Video', es: 'Video', pt: 'Video', pl: 'Wideo', ru: 'Видео' },
  colImage:     { en: 'Image', es: 'Imagen', pt: 'Imagem', pl: 'Obraz', ru: 'Изобр.' },
  colAi:        { en: 'AI', es: 'IA', pt: 'IA', pl: 'AI', ru: 'AI' },
  colReset:     { en: 'Credits reset', es: 'Reinicio', pt: 'Reinicio', pl: 'Reset', ru: 'Сброс' },
  colLastSeen:  { en: 'Last sign-in', es: 'Ultimo acceso', pt: 'Ultimo acesso', pl: 'Ostatnie logowanie', ru: 'Последний вход' },
  never:        { en: 'never', es: 'nunca', pt: 'nunca', pl: 'nigdy', ru: 'никогда' },
  legacyTag:    { en: 'legacy', es: 'legado', pt: 'legado', pl: 'starszy', ru: 'старый' },
  refresh:      { en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', pl: 'Odswiez', ru: 'Обновить' },
  perMonth:     { en: '/mo', es: '/mes', pt: '/mes', pl: '/mies', ru: '/мес' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const PLAN_LABELS: Record<string, string> = { free: 'Free Demo', launch: 'Launch', growth: 'Growth', command: 'Command' }
const PLAN_COLORS: Record<string, string> = { free: 'text-white/60 border-white/20', launch: 'text-sky-300 border-sky-300/40', growth: 'text-emerald-300 border-emerald-300/40', command: 'text-[#FFD700] border-[#FFD700]/50' }

function fmtDate(iso: string | null, never: string): string {
  if (!iso) return never
  const d = new Date(iso)
  return isNaN(d.getTime()) ? never : d.toISOString().slice(0, 10)
}

export default function AdminUsagePage() {
  const { lang } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<UsageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true); setError(null); setForbidden(false)
    try {
      const res = await fetch('/api/admin/usage')
      if (res.status === 401 || res.status === 403) { setForbidden(true); return }
      const json = await res.json()
      if (!json.ok) { setError(json.error || 'Unknown error'); return }
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (mounted) load() }, [mounted])

  if (!mounted) return <main className="min-h-screen bg-[#05070b]" />

  const paidCount = data ? (data.planCounts.launch || 0) + (data.planCounts.growth || 0) + (data.planCounts.command || 0) : 0

  return (
    <main className="min-h-screen bg-[#05070b] p-6 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.20),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{c('eyebrow', lang)}</p>
        <h1 className="mt-4 text-4xl font-black">{c('title', lang)}</h1>
        <p className="mt-3 max-w-3xl text-white/70">{c('subtitle', lang)}</p>
      </section>

      {loading ? <p className="mt-8 text-white/60">{c('loading', lang)}</p> : null}
      {forbidden ? <p className="mt-8 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{c('forbidden', lang)}</p> : null}
      {error ? <p className="mt-8 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{c('errorLabel', lang)} {error}</p> : null}

      {data ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/5 p-5"><p className="text-xs uppercase tracking-widest text-white/50">{c('mrr', lang)}</p><p className="mt-2 text-3xl font-black text-[#FFD700]">${data.mrr}<span className="text-base font-normal text-white/50">{c('perMonth', lang)}</span></p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs uppercase tracking-widest text-white/50">{c('subscribers', lang)}</p><p className="mt-2 text-3xl font-black">{data.totalSubscriptions}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs uppercase tracking-widest text-white/50">{c('authUsers', lang)}</p><p className="mt-2 text-3xl font-black">{data.totalAuthUsers}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><p className="text-xs uppercase tracking-widest text-white/50">{c('paidUsers', lang)}</p><p className="mt-2 text-3xl font-black text-emerald-300">{paidCount}</p></div>
          </div>

          <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-5">
            <h2 className="text-xl font-bold">{c('planDist', lang)}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {(['free', 'launch', 'growth', 'command'] as const).map((p) => {
                const count = data.planCounts[p] || 0
                const pct = data.totalSubscriptions ? Math.round((count / data.totalSubscriptions) * 100) : 0
                return (
                  <div key={p} className={`rounded-2xl border p-4 ${PLAN_COLORS[p]}`}>
                    <p className="font-bold">{PLAN_LABELS[p]}</p>
                    <p className="mt-1 text-2xl font-black text-white">{count}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-current" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-white/50">{pct}%</p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{c('userTable', lang)}</h2>
              <button type="button" onClick={load} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/60 hover:border-white/40 hover:text-white/80 transition">↻ {c('refresh', lang)}</button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-widest text-white/40">
                    <th className="px-3 py-2">{c('colUser', lang)}</th>
                    <th className="px-3 py-2">{c('colPlan', lang)}</th>
                    <th className="px-3 py-2 text-right">{c('colVideo', lang)}</th>
                    <th className="px-3 py-2 text-right">{c('colImage', lang)}</th>
                    <th className="px-3 py-2 text-right">{c('colAi', lang)}</th>
                    <th className="px-3 py-2">{c('colReset', lang)}</th>
                    <th className="px-3 py-2">{c('colLastSeen', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[.03]">
                      <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-3 py-2"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${PLAN_COLORS[u.plan] || PLAN_COLORS.free}`}>{PLAN_LABELS[u.plan] || u.plan}</span>{u.rawPlan !== u.plan && u.rawPlan !== 'demo' ? <span className="ml-2 text-[10px] uppercase text-white/30">{u.rawPlan} ({c('legacyTag', lang)})</span> : null}</td>
                      <td className="px-3 py-2 text-right font-mono">{u.videoCredits ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{u.imageCredits ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{u.aiCredits ?? '—'}</td>
                      <td className="px-3 py-2 text-white/50">{fmtDate(u.creditsResetAt, c('never', lang))}</td>
                      <td className="px-3 py-2 text-white/50">{fmtDate(u.lastSignInAt, c('never', lang))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
