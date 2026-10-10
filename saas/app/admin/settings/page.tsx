'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'

type Flag = { key: string; label: string; desc: string; on: boolean }

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2).toLowerCase()
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  if (l === 'de') return 'de'
  if (l === 'fr') return 'fr'
  if (l === 'it') return 'it'
  if (l === 'ja') return 'ja'
  if (l === 'ko') return 'ko'
  if (l === 'ar') return 'ar'
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
    eyebrow: uiText('generatedUi.u_c1c224b03cd9bc7b'),
    title: uiText('generatedUi.u_28c83220eb3316b6'),
    subtitle: uiText('generatedUi.u_6a03592a29caad34'),
    saving: uiText('generatedUi.u_945d2c03508adc66'),
    loading: uiText('generatedUi.u_e71a13459ccdcc88'),
    footer: uiText('generatedUi.u_2987a13f062a435c'),
    notAllowedTitle: uiText('generatedUi.u_502d9f3ec97225bc'),
    notAllowedBody: uiText('generatedUi.u_ce2d5dade0659930'),
    flags: {
      outreach_sending_disabled: { label: uiText('generatedUi.u_267775fc98f11247'), desc: uiText('generatedUi.u_665e52e8f1e417db') },
      signups_paused: { label: uiText('generatedUi.u_9218d14c1c3792b2'), desc: uiText('generatedUi.u_d232597107f969c7') },
      maintenance_mode: { label: uiText('generatedUi.u_20b9595b93571625'), desc: uiText('generatedUi.u_7ccf42212ccf69ad') },
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
  de: {
    eyebrow: 'Verwaltung',
    title: 'Systemeinstellungen',
    subtitle: 'Nur für den Eigentümer verfügbare Schalter, die die gesamte Plattform betreffen.',
    saving: 'wird gespeichert …',
    loading: 'Einstellungen werden geladen…',
    footer: 'Änderungen werden sofort wirksam. Der Outreach-Notschalter wird bereits von den Versandrouten durchgesetzt; die anderen sind gespeichert und bereit, mit dem Verhalten verknüpft zu werden.',
    notAllowedTitle: 'Admin-Einstellungen',
    notAllowedBody: 'Nur der Kontoinhaber kann Systemeinstellungen ändern.',
    flags: {
      outreach_sending_disabled: { label: 'Outreach-Versand pausieren', desc: 'Haupt-Notschalter: Wenn aktiviert, werden keine Outreach-Nachrichten gesendet.' },
      signups_paused: { label: 'Neue Registrierungen pausieren', desc: 'Wenn aktiviert, wird von der Erstellung neuer Konten in der Benutzeroberfläche abgeraten.' },
      maintenance_mode: { label: 'Wartungsbanner', desc: 'Wenn aktiviert, können Sie Benutzern einen Wartungshinweis anzeigen.' },
    },
  },
  fr: {
    eyebrow: 'Administration',
    title: 'Paramètres système',
    subtitle: 'Commutateurs réservés au propriétaire qui affectent toute la plateforme.',
    saving: 'enregistrement…',
    loading: 'Chargement des paramètres…',
    footer: 'Les modifications prennent effet immédiatement. Le coupe-circuit de prospection est déjà appliqué par les routes d\'envoi ; les autres sont enregistrés et prêts à être reliés au comportement.',
    notAllowedTitle: 'Paramètres d’administration',
    notAllowedBody: 'Seul le propriétaire du compte peut modifier les paramètres système.',
    flags: {
      outreach_sending_disabled: { label: 'Suspendre l\'envoi de prospection', desc: 'Interrupteur d’arrêt principal : lorsqu’il est activé, aucun message de prospection n’est envoyé.' },
      signups_paused: { label: 'Suspendre les nouvelles inscriptions', desc: 'Lorsque cette option est activée, la création de nouveaux comptes est déconseillée dans l’interface.' },
      maintenance_mode: { label: 'Bannière de maintenance', desc: 'Lorsque cette option est activée, vous pouvez afficher un avis de maintenance aux utilisateurs.' },
    },
  },
  it: {
    eyebrow: 'Amministrazione',
    title: 'Impostazioni di sistema',
    subtitle: 'Interruttori riservati al proprietario che influenzano l\'intera piattaforma.',
    saving: 'salvataggio…',
    loading: 'Caricamento impostazioni…',
    footer: 'Le modifiche hanno effetto immediato. Il kill-switch dell\'outreach è già applicato dalle route di invio; gli altri sono salvati e pronti per essere collegati al comportamento.',
    notAllowedTitle: 'Impostazioni amministratore',
    notAllowedBody: 'Solo il proprietario dell’account può modificare le impostazioni di sistema.',
    flags: {
      outreach_sending_disabled: { label: 'Sospendi l\'invio di outreach', desc: 'Interruttore di emergenza principale: quando è attivo, non viene inviato alcun messaggio di outreach.' },
      signups_paused: { label: 'Sospendi le nuove registrazioni', desc: 'Se attivo, la creazione di nuovi account viene scoraggiata nell’interfaccia.' },
      maintenance_mode: { label: 'Banner di manutenzione', desc: 'Se attivo, puoi mostrare un avviso di manutenzione agli utenti.' },
    },
  },
  ja: {
    eyebrow: '管理',
    title: 'システム設定',
    subtitle: 'プラットフォーム全体に影響する、オーナー専用のスイッチです。',
    saving: '保存中…',
    loading: '設定を読み込み中…',
    footer: '変更は直ちに反映されます。アウトリーチのキルスイッチは送信ルートですでに適用されています。その他の設定は保存済みで、動作への接続準備ができています。',
    notAllowedTitle: '管理者設定',
    notAllowedBody: 'システム設定を変更できるのはアカウント所有者のみです。',
    flags: {
      outreach_sending_disabled: { label: 'アウトリーチ送信を一時停止', desc: 'マスターキルスイッチ: オンの場合、アウトリーチメッセージは一切送信されません。' },
      signups_paused: { label: '新規登録を一時停止', desc: 'オンにすると、UI で新規アカウントの作成が推奨されなくなります。' },
      maintenance_mode: { label: 'メンテナンスバナー', desc: 'オンにすると、ユーザーにメンテナンスのお知らせを表示できます。' },
    },
  },
  ko: {
    eyebrow: '관리',
    title: '시스템 설정',
    subtitle: '플랫폼 전체에 영향을 주는 소유자 전용 스위치입니다.',
    saving: '저장 중…',
    loading: '설정 불러오는 중…',
    footer: '변경 사항은 즉시 적용됩니다. 아웃리치 킬 스위치는 이미 발송 경로에서 적용되고 있으며, 나머지는 저장되어 동작에 연결할 준비가 되어 있습니다.',
    notAllowedTitle: '관리자 설정',
    notAllowedBody: '계정 소유자만 시스템 설정을 변경할 수 있습니다.',
    flags: {
      outreach_sending_disabled: { label: '아웃리치 발송 일시 중지', desc: '마스터 킬 스위치: 켜져 있으면 아웃리치 메시지가 전송되지 않습니다.' },
      signups_paused: { label: '신규 가입 일시 중지', desc: '켜면 UI에서 새 계정 생성이 권장되지 않습니다.' },
      maintenance_mode: { label: '유지 관리 배너', desc: '켜면 사용자에게 유지 관리 공지를 표시할 수 있습니다.' },
    },
  },
  ar: {
    eyebrow: 'الإدارة',
    title: 'إعدادات النظام',
    subtitle: 'مفاتيح خاصة بالمالك فقط تؤثر في المنصة بأكملها.',
    saving: 'جارٍ الحفظ…',
    loading: 'جارٍ تحميل الإعدادات…',
    footer: 'تسري التغييرات فورًا. يُطبَّق مفتاح الإيقاف الطارئ لحملات التواصل بالفعل عبر مسارات الإرسال؛ أما البقية فمحفوظة وجاهزة لربطها بالسلوك.',
    notAllowedTitle: 'إعدادات المسؤول',
    notAllowedBody: 'لا يمكن تغيير إعدادات النظام إلا لمالك الحساب.',
    flags: {
      outreach_sending_disabled: { label: 'إيقاف إرسال حملات التواصل مؤقتًا', desc: 'مفتاح الإيقاف الرئيسي: عند تشغيله، لا تُرسل أي رسائل تواصل.' },
      signups_paused: { label: 'إيقاف التسجيلات الجديدة مؤقتًا', desc: 'عند التفعيل، لا يُشجَّع على إنشاء حسابات جديدة في واجهة المستخدم.' },
      maintenance_mode: { label: 'شريط الصيانة', desc: 'عند التفعيل، يمكنك عرض إشعار صيانة للمستخدمين.' },
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
      if (!res.ok) { setError(data?.error || "Could not load settings."); setLoading(false); return }
      setFlags(Array.isArray(data.flags) ? data.flags : [])
    } catch {
      setError("Something went wrong loading settings.")
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
        setError(d?.error || "Could not save that setting.")
      } else {
        setError('')
      }
    } catch {
      setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: !next } : f)))
      setError("Could not save that setting.")
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
                  {savingKey === f.key && <span className="sb-caption" style={{ marginInlineStart: 8, opacity: 0.6 }}>{c.saving}</span>}
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
