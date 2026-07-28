'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'

type Flag = { key: string; label: string; desc: string; on: boolean }

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2).toLowerCase()
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  return 'en'
}

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  subtitle: string
  saving: string
  loading: string
  footer: string
  notAllowedTitle: string
  notAllowedBody: string
  flags: Record<string, { label: string; desc: string }>
}> = {
  en: {
    eyebrow: uiCopy('u_19bfb5d51389b2ee'),
    title: uiCopy('u_e16349f03a3b22d6'),
    subtitle: uiCopy('u_9d62a29d4c77d74d'),
    saving: uiCopy('u_8870b711176b2790'),
    loading: uiCopy('u_677b035839c79d53'),
    footer: uiCopy('u_23cbcf5b895ad875'),
    notAllowedTitle: uiCopy('u_d3c60eecce742215'),
    notAllowedBody: uiCopy('u_fa63c1cade6844b1'),
    flags: {
      outreach_sending_disabled: { label: uiCopy('u_0e39fcbfd4f15c61'), desc: uiCopy('u_bb1812257ccf8a0d') },
      signups_paused: { label: uiCopy('u_b2311394b683f902'), desc: uiCopy('u_2129a3eedd8ecda2') },
      maintenance_mode: { label: uiCopy('u_2622e6c83e14b41c'), desc: uiCopy('u_5708c9e233223ecf') },
    },
  },
  es: {
    eyebrow: 'Admin',
    title: 'Configuración del sistema',
    subtitle: 'Interruptores exclusivos del propietario que afectan toda la plataforma.',
    saving: 'guardando…',
    loading: 'Cargando configuración…',
    footer: 'Los cambios surten efecto de inmediato. El interruptor de alcance ya está aplicado por las rutas de envío; los demás están almacenados y listos para conectarse al comportamiento.',
    notAllowedTitle: 'Configuración de administrador',
    notAllowedBody: 'Solo el propietario de la cuenta puede cambiar la configuración del sistema.',
    flags: {
      outreach_sending_disabled: { label: 'Pausar envío de alcance', desc: 'Interruptor maestro: cuando está activado, no se envían mensajes de alcance.' },
      signups_paused: { label: 'Pausar nuevos registros', desc: 'Cuando está activado, se desalienta la creación de cuentas en la interfaz.' },
      maintenance_mode: { label: 'Banner de mantenimiento', desc: 'Cuando está activado, puedes mostrar un aviso de mantenimiento a los usuarios.' },
    },
  },
  pt: {
    eyebrow: 'Admin',
    title: 'Configurações do sistema',
    subtitle: 'Interruptores exclusivos do proprietário que afetam toda a plataforma.',
    saving: 'salvando…',
    loading: 'Carregando configurações…',
    footer: 'As alterações entram em vigor imediatamente. O interruptor de alcance já é aplicado pelas rotas de envio; os demais estão armazenados e prontos para serem conectados ao comportamento.',
    notAllowedTitle: 'Configurações de administrador',
    notAllowedBody: 'Apenas o proprietário da conta pode alterar as configurações do sistema.',
    flags: {
      outreach_sending_disabled: { label: 'Pausar envio de prospecção', desc: 'Interruptor mestre: quando ativado, nenhuma mensagem de prospecção é enviada.' },
      signups_paused: { label: 'Pausar novos cadastros', desc: 'Quando ativado, a criação de novas contas é desencorajada na interface.' },
      maintenance_mode: { label: 'Banner de manutenção', desc: 'Quando ativado, você pode exibir um aviso de manutenção aos usuários.' },
    },
  },
  pl: {
    eyebrow: 'Admin',
    title: 'Ustawienia systemu',
    subtitle: 'Przełączniki tylko dla właściciela wpływające na całą platformę.',
    saving: 'zapisywanie…',
    loading: 'Ładowanie ustawień…',
    footer: 'Zmiany wchodzą w życie natychmiast. Przełącznik zasięgu jest już wymuszany przez trasy wysyłania; pozostałe są przechowywane i gotowe do podłączenia do zachowania.',
    notAllowedTitle: 'Ustawienia administratora',
    notAllowedBody: 'Tylko właściciel konta może zmieniać ustawienia systemowe.',
    flags: {
      outreach_sending_disabled: { label: 'Wstrzymaj wysyłanie kontaktów', desc: 'Główny wyłącznik: gdy włączony, nie są wysyłane żadne wiadomości.' },
      signups_paused: { label: 'Wstrzymaj nowe rejestracje', desc: 'Gdy włączone, tworzenie nowych kont jest zniechęcane w interfejsie.' },
      maintenance_mode: { label: 'Baner konserwacji', desc: 'Gdy włączone, możesz pokazać użytkownikom informację o konserwacji.' },
    },
  },
  ru: {
    eyebrow: 'Админ',
    title: 'Системные настройки',
    subtitle: 'Переключатели только для владельца, влияющие на всю платформу.',
    saving: 'сохранение…',
    loading: 'Загрузка настроек…',
    footer: 'Изменения вступают в силу немедленно. Переключатель рассылки уже применяется маршрутами отправки; остальные сохранены и готовы к подключению к поведению.',
    notAllowedTitle: 'Настройки администратора',
    notAllowedBody: 'Только владелец аккаунта может изменять системные настройки.',
    flags: {
      outreach_sending_disabled: { label: 'Приостановить рассылку', desc: 'Главный выключатель: когда включён, сообщения не отправляются.' },
      signups_paused: { label: 'Приостановить регистрации', desc: 'Когда включено, создание новых аккаунтов не поощряется в интерфейсе.' },
      maintenance_mode: { label: 'Баннер обслуживания', desc: 'Когда включено, вы можете показать пользователям уведомление об обслуживании.' },
    },
  },
}

export default function AdminSettingsPage() {
  const { lang: activeLang } = useI18n()
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [notAllowed, setNotAllowed] = useState(false)
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => { setLang(getLang()) }, [])
  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setNotAllowed(true); setLoading(false); return }
      const data = await res.json()
      if (!res.ok) { setError(data?.error || uiCopy('u_00e86d2f0aa4e104')); setLoading(false); return }
      setFlags(Array.isArray(data.flags) ? data.flags : [])
    } catch {
      setError(uiCopy('u_4b9445189c2469c4'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(key: string, next: boolean) {
    setSavingKey(key)
    setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: next } : f)))
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, on: next }),
      })
      if (!res.ok) {
        setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: !next } : f)))
        const d = await res.json().catch(() => ({}))
        setError(d?.error || uiCopy('u_a60c8beb967ac649'))
      } else {
        setError('')
      }
    } catch {
      setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: !next } : f)))
      setError(uiCopy('u_7284d6b7ce7c1b86'))
    } finally {
      setSavingKey(null)
    }
  }

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>{c.notAllowedTitle}</h1>
          <p className="sb-body" style={{ margin: 0 }}>{c.notAllowedBody}</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">{c.eyebrow}</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>{c.title}</h1>
        <p className="sb-body" style={{ margin: 0 }}>{c.subtitle}</p>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && <p className="sb-body">{c.loading}</p>}

      {!loading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {flags.map(f => (
            <div key={f.key} className="sb-card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  {c.flags[f.key]?.label || f.label}
                  {savingKey === f.key && <span className="sb-caption" style={{ marginLeft: 8, opacity: 0.6 }}>{c.saving}</span>}
                </div>
                <div className="sb-caption" style={{ marginTop: 4 }}>{c.flags[f.key]?.desc || f.desc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={f.on}
                onClick={() => toggle(f.key, !f.on)}
                disabled={savingKey === f.key}
                style={{
                  flexShrink: 0, width: 48, height: 27, borderRadius: 999, border: 'none',
                  cursor: savingKey === f.key ? 'wait' : 'pointer',
                  background: f.on ? GOLD : 'rgba(255,255,255,.18)', position: 'relative', transition: 'background .15s',
                }}
              >
                <span style={{ position: 'absolute', top: 3, left: f.on ? 24 : 3, width: 21, height: 21, borderRadius: '50%', background: '#0f1117', transition: 'left .15s' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="sb-caption" style={{ marginTop: 18, opacity: 0.6 }}>
        {c.footer}
      </p>
    </main>
  )
}
