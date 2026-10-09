'use client'

// saas/components/agency/RenderCredits.tsx
// Render-credit balance + one-time top-up packs for customers. Verified owners
// receive unlimited internal render access and never see a purchase prompt.

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const PACKS: { id: 'small' | 'medium' | 'large'; credits: number; popular?: boolean }[] = [
  { id: 'small', credits: 1500 },
  { id: 'medium', credits: 4500, popular: true },
  { id: 'large', credits: 15000 },
]

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY: Record<Lang, {
  title: string
  subtitle: string
  balanceLabel: string
  creditsWord: string
  unlimited: string
  ownerSubtitle: string
  buyCta: string
  redirecting: string
  buyError: string
  popular: string
  signedOut: string
}> = {
  en: { title: uiText('generatedUi.u_a75e56e517cd282a'), subtitle: uiText('generatedUi.u_210d4a3f4832fbf2'), balanceLabel: uiText('generatedUi.u_dc808959338579e0'), creditsWord: uiText('generatedUi.u_be379a30f1aa05d1'), unlimited: uiText('generatedUi.u_11dde17d6c3e2098'), ownerSubtitle: uiText('generatedUi.u_69ae03e155a02858'), buyCta: uiText('generatedUi.u_64e3cb0e4960ba69'), redirecting: uiText('generatedUi.u_0d83b98bebfb5add'), buyError: uiText('generatedUi.u_827beb6ec9dcac23'), popular: uiText('generatedUi.u_76327dec9ae3a06a'), signedOut: uiText('generatedUi.u_3599fd816d4ea769') },
  es: { title: 'Créditos de render', subtitle: 'Los créditos prepagos impulsan la producción cinematográfica. Recarga una vez y paga solo lo que usa cada render.', balanceLabel: 'Tu saldo', creditsWord: 'créditos', unlimited: 'Ilimitados', ownerSubtitle: 'El acceso del propietario incluye créditos ilimitados y todas las herramientas internas aprobadas.', buyCta: 'Comprar', redirecting: 'Redirigiendo…', buyError: 'No se pudo iniciar el pago.', popular: 'Popular', signedOut: 'Inicia sesión para ver tu saldo y recargar créditos de render.' },
  pt: { title: 'Créditos de render', subtitle: 'Créditos pré-pagos alimentam a produção cinematográfica. Recarregue uma vez e pague apenas pelo uso.', balanceLabel: 'Seu saldo', creditsWord: 'créditos', unlimited: 'Ilimitados', ownerSubtitle: 'O acesso do proprietário inclui créditos ilimitados e todas as ferramentas internas aprovadas.', buyCta: 'Comprar', redirecting: 'Redirecionando…', buyError: 'Não foi possível iniciar o pagamento.', popular: 'Popular', signedOut: 'Faça login para ver seu saldo e recarregar créditos de render.' },
  pl: { title: 'Kredyty renderowania', subtitle: 'Przedpłacone kredyty napędzają produkcję. Doładuj konto i płać tylko za użycie.', balanceLabel: 'Twoje saldo', creditsWord: 'kredytów', unlimited: 'Bez limitu', ownerSubtitle: 'Dostęp właściciela obejmuje nielimitowane kredyty i wszystkie zatwierdzone narzędzia wewnętrzne.', buyCta: 'Kup', redirecting: 'Przekierowanie…', buyError: 'Nie udało się rozpocząć płatności.', popular: 'Popularne', signedOut: 'Zaloguj się, aby zobaczyć saldo i doładować kredyty.' },
  ru: { title: 'Кредиты рендеринга', subtitle: 'Предоплаченные кредиты обеспечивают производство. Пополняйте и платите только за использование.', balanceLabel: 'Ваш баланс', creditsWord: 'кредитов', unlimited: 'Без ограничений', ownerSubtitle: 'Доступ владельца включает неограниченные кредиты и все одобренные внутренние инструменты.', buyCta: 'Купить', redirecting: 'Перенаправление…', buyError: 'Не удалось начать оплату.', popular: 'Популярный', signedOut: 'Войдите, чтобы увидеть баланс и пополнить кредиты.' },
  de: { title: 'Render-Guthaben', subtitle: 'Prepaid-Credits treiben die filmische Produktion an. Einmal aufladen, nur das ausgeben, was jedes Rendering verbraucht – es wird nichts berechnet, bis Sie produzieren.', balanceLabel: 'Ihr Guthaben', creditsWord: 'Credits', unlimited: 'Unbegrenzt', ownerSubtitle: 'Der Inhaberzugang umfasst unbegrenzte Plattform-Credits und alle genehmigten internen Tools.', buyCta: 'Kaufen', redirecting: 'Weiterleitung…', buyError: 'Der Bezahlvorgang konnte nicht gestartet werden.', popular: 'Beliebt', signedOut: 'Melden Sie sich an, um Ihr Guthaben zu sehen und Render-Credits aufzuladen.' },
  fr: { title: 'Crédits de rendu', subtitle: 'Les crédits prépayés alimentent la production cinématographique. Rechargez une fois, ne dépensez que ce que consomme chaque rendu : rien n’est facturé tant que vous ne produisez pas.', balanceLabel: 'Votre solde', creditsWord: 'crédits', unlimited: 'Illimité', ownerSubtitle: 'L’accès propriétaire inclut des crédits de plateforme illimités et tous les outils internes approuvés.', buyCta: 'Acheter', redirecting: 'Redirection…', buyError: 'Impossible de lancer le paiement.', popular: 'Populaire', signedOut: 'Connectez-vous pour consulter votre solde et recharger vos crédits de rendu.' },
  it: { title: 'Crediti di rendering', subtitle: 'I crediti prepagati alimentano la produzione cinematografica. Ricarica una volta e spendi solo ciò che usa ogni rendering: non viene addebitato nulla finché non produci.', balanceLabel: 'Il tuo saldo', creditsWord: 'crediti', unlimited: 'Illimitato', ownerSubtitle: 'L’accesso proprietario include crediti di piattaforma illimitati e tutti gli strumenti interni approvati.', buyCta: 'Acquista', redirecting: 'Reindirizzamento…', buyError: 'Impossibile avviare il checkout.', popular: 'Popolare', signedOut: 'Accedi per vedere il tuo saldo e ricaricare i crediti di rendering.' },
  ja: { title: 'レンダリングクレジット', subtitle: 'プリペイドクレジットでシネマティック制作を行います。一度チャージすれば、各レンダリングで使用した分だけを消費します。制作するまで料金は発生しません。', balanceLabel: '残高', creditsWord: 'クレジット', unlimited: '無制限', ownerSubtitle: 'オーナーアクセスには、無制限のプラットフォームクレジットと承認済みのすべての社内ツールが含まれます。', buyCta: '購入', redirecting: 'リダイレクト中…', buyError: 'チェックアウトを開始できませんでした。', popular: '人気', signedOut: 'サインインして残高を確認し、レンダリングクレジットをチャージしてください。' },
  ko: { title: '렌더링 크레딧', subtitle: '선불 크레딧으로 시네마틱 제작이 이루어집니다. 한 번 충전하고 각 렌더링에 사용한 만큼만 지출하세요. 제작하기 전까지는 요금이 청구되지 않습니다.', balanceLabel: '내 잔액', creditsWord: '크레딧', unlimited: '무제한', ownerSubtitle: '소유자 액세스에는 무제한 플랫폼 크레딧과 승인된 모든 내부 도구가 포함됩니다.', buyCta: '구매', redirecting: '리디렉션 중…', buyError: '결제를 시작할 수 없습니다.', popular: '인기', signedOut: '로그인하여 잔액을 확인하고 렌더링 크레딧을 충전하세요.' },
  ar: { title: 'أرصدة العرض', subtitle: 'تُشغّل الأرصدة المدفوعة مسبقًا الإنتاج السينمائي. اشحن مرة واحدة وأنفق فقط ما يستهلكه كل عرض؛ لا يُفرض أي رسم حتى تبدأ الإنتاج.', balanceLabel: 'رصيدك', creditsWord: 'أرصدة', unlimited: 'غير محدود', ownerSubtitle: 'يشمل وصول المالك أرصدة منصة غير محدودة وجميع الأدوات الداخلية المعتمدة.', buyCta: 'شراء', redirecting: 'جارٍ إعادة التوجيه…', buyError: 'تعذّر بدء عملية الدفع.', popular: 'الأكثر رواجًا', signedOut: 'سجّل الدخول لعرض رصيدك وشحن أرصدة العرض.' },
}

export default function RenderCredits() {
  const { lang } = useI18n()
  const copy = COPY[(['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang]
  const [signedIn, setSignedIn] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [unlimited, setUnlimited] = useState(false)
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
        setUnlimited(Boolean(data.unlimited))
        setBalance(data.balance === null || data.balance === undefined ? null : Number(data.balance) || 0)
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
      if (data?.url) window.location.href = data.url
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
            <p className="sb-body" style={{ margin: '6px 0 0', maxWidth: 620, fontSize: 13 }}>{unlimited ? copy.ownerSubtitle : copy.subtitle}</p>
          </div>
          {signedIn ? (
            <div style={{ textAlign: 'right' }}>
              <div className="sb-caption">{copy.balanceLabel}</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: unlimited ? 22 : 28, fontWeight: 900, color: '#1af0ff' }}>
                {unlimited ? copy.unlimited : (balance ?? 0).toLocaleString()}
              </div>
              {!unlimited ? <div className="sb-caption">{copy.creditsWord}</div> : null}
            </div>
          ) : null}
        </div>

        {!loading && !signedIn ? <p className="sb-body" style={{ margin: 0, color: '#fbbf24', fontSize: 13 }}>{copy.signedOut}</p> : null}

        {!unlimited ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {PACKS.map((pk) => {
              const busy = buying === pk.id
              return (
                <div key={pk.id} style={{ flex: '1 1 200px', minWidth: 180, borderRadius: 14, border: pk.popular ? '1px solid rgba(255,195,0,.45)' : '1px solid rgba(255,255,255,.12)', background: pk.popular ? 'rgba(255,195,0,.06)' : 'rgba(255,255,255,.03)', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 900, color: '#fff' }}>{pk.credits.toLocaleString()}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>{copy.creditsWord}</span>
                    {pk.popular ? <span style={{ marginLeft: 'auto', borderRadius: 999, border: '1px solid rgba(255,195,0,.4)', padding: '2px 8px', fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#ffc300' }}>{copy.popular}</span> : null}
                  </div>
                  <button type="button" onClick={() => startTopup(pk.id)} disabled={busy} className={pk.popular ? 'sb-button-primary' : 'sb-button-secondary'} style={{ width: '100%', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                    {busy ? copy.redirecting : `${copy.buyCta} ${pk.credits.toLocaleString()} ${copy.creditsWord}`}
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        {buyError ? <div style={{ fontSize: 12, color: '#fca5a5' }}>{buyError}</div> : null}
      </div>
    </section>
  )
}
