// saas/app/dashboard/supervisor/license/page.tsx
//
// LICENCE SETUP, IN THE BROWSER.
//
// The seller-side CLI (scripts/issue-license.ts) assumes a terminal. This page is the same
// operation for an operator who works in a browser: name the licensee, pick an edition,
// press once, and copy the three values into the deployment.
//
// THIS IS OPERATOR SETUP, NOT PART OF THE BUYER DEMO. It lives on its own route rather than
// on /dashboard/supervisor/demo deliberately — a prospect watching a demonstration should
// never be shown the screen that mints credentials.
//
// THE PRIVATE KEY IS DISPLAYED ONCE AND NEVER STORED. The page says so where it is shown,
// not in a footnote, because a key nobody realised was unrecoverable is a key that gets
// lost.

'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

// Catalogue identifiers, not UI copy — they are never translated.
const EDITIONS = ['standard', 'enterprise']

type MintResult = {
  ok?: boolean
  error?: string
  remedy?: string
  editions?: string[]
  licence?: {
    licenseId?: string
    licensee?: string
    issuer?: string
    edition?: string
    features?: string[]
    expiresAt?: string
    graceDays?: number
  }
  environment?: Record<string, string>
  privateKeyPem?: string
  warnings?: string[]
}

type Copy = {
  title: string
  intro: string
  licensee: string
  licenseePlaceholder: string
  edition: string
  days: string
  mint: string
  minting: string
  needLicensee: string
  failed: string
  resultTitle: string
  envTitle: string
  envNote: string
  privateTitle: string
  privateNote: string
  detailsTitle: string
  licenseId: string
  features: string
  expires: string
  nextTitle: string
  nextBody: string
}

const COPY: Record<Language, Copy> = {
  en: {
    title: 'Self-Healing Supervisor — licence setup',
    intro: 'Generates an issuer key pair and signs a licence for this product. The three values below go into the deployment environment.',
    licensee: 'Licensed to',
    licenseePlaceholder: 'Legal entity name',
    edition: 'Edition',
    days: 'Valid for (days)',
    mint: 'Mint licence',
    minting: 'Minting…',
    needLicensee: 'Enter the name of the party this licence is issued to.',
    failed: 'The request did not complete',
    resultTitle: 'Licence issued',
    envTitle: 'Environment variables',
    envNote: 'Set all three in the deployment, then redeploy. Licence configuration is read once per process, so editing a variable changes nothing until a new deployment starts.',
    privateTitle: 'Private key — shown once',
    privateNote: 'This is not stored anywhere. Put it in your vault now. It cannot be recovered, and it is the only thing that can mint a licence this deployment will accept.',
    detailsTitle: 'Record',
    licenseId: 'Licence id',
    features: 'Features',
    expires: 'Expires',
    nextTitle: 'After it is installed',
    nextBody: 'Open the demo page and raise a drill incident. The drill reports the licence verdict, so it is the honest test of whether the token took.',
  },
  es: {
    title: 'Supervisor de Autorreparación — configuración de licencia',
    intro: 'Genera un par de claves de emisor y firma una licencia para este producto. Los tres valores siguientes se colocan en el entorno del despliegue.',
    licensee: 'Licencia a nombre de',
    licenseePlaceholder: 'Nombre de la entidad legal',
    edition: 'Edición',
    days: 'Vigencia (días)',
    mint: 'Emitir licencia',
    minting: 'Emitiendo…',
    needLicensee: 'Indique la parte a la que se emite esta licencia.',
    failed: 'La solicitud no se completó',
    resultTitle: 'Licencia emitida',
    envTitle: 'Variables de entorno',
    envNote: 'Defina las tres en el despliegue y vuelva a desplegar. La configuración de licencia se lee una vez por proceso, así que editar una variable no cambia nada hasta que arranque un despliegue nuevo.',
    privateTitle: 'Clave privada: se muestra una sola vez',
    privateNote: 'No se guarda en ningún sitio. Guárdela ahora en su almacén de secretos. No se puede recuperar y es lo único que puede emitir una licencia que este despliegue acepte.',
    detailsTitle: 'Registro',
    licenseId: 'Id de licencia',
    features: 'Funciones',
    expires: 'Caduca',
    nextTitle: 'Una vez instalada',
    nextBody: 'Abra la página de demostración y genere un incidente de prueba. La prueba informa del veredicto de la licencia, así que es la comprobación honesta de si el token quedó activo.',
  },
  pt: {
    title: 'Supervisor de Autorreparação — configuração de licença',
    intro: 'Gera um par de chaves de emissor e assina uma licença para este produto. Os três valores abaixo entram no ambiente da implantação.',
    licensee: 'Licenciado a',
    licenseePlaceholder: 'Nome da entidade legal',
    edition: 'Edição',
    days: 'Válida por (dias)',
    mint: 'Emitir licença',
    minting: 'A emitir…',
    needLicensee: 'Indique a parte a quem esta licença é emitida.',
    failed: 'O pedido não foi concluído',
    resultTitle: 'Licença emitida',
    envTitle: 'Variáveis de ambiente',
    envNote: 'Defina as três na implantação e volte a implantar. A configuração de licença é lida uma vez por processo, por isso editar uma variável não muda nada até arrancar uma nova implantação.',
    privateTitle: 'Chave privada — mostrada uma só vez',
    privateNote: 'Não é guardada em lado nenhum. Coloque-a já no seu cofre. Não pode ser recuperada e é a única coisa capaz de emitir uma licença que esta implantação aceite.',
    detailsTitle: 'Registo',
    licenseId: 'Id da licença',
    features: 'Funcionalidades',
    expires: 'Expira',
    nextTitle: 'Depois de instalada',
    nextBody: 'Abra a página de demonstração e levante um incidente de treino. O treino reporta o veredito da licença, por isso é o teste honesto de que o token ficou activo.',
  },
  pl: {
    title: 'Nadzorca Samonaprawy — konfiguracja licencji',
    intro: 'Generuje parę kluczy wydawcy i podpisuje licencję dla tego produktu. Trzy poniższe wartości trafiają do środowiska wdrożenia.',
    licensee: 'Licencja dla',
    licenseePlaceholder: 'Nazwa podmiotu prawnego',
    edition: 'Edycja',
    days: 'Ważna przez (dni)',
    mint: 'Wydaj licencję',
    minting: 'Wydawanie…',
    needLicensee: 'Podaj podmiot, dla którego wydawana jest licencja.',
    failed: 'Żądanie nie zostało ukończone',
    resultTitle: 'Licencja wydana',
    envTitle: 'Zmienne środowiskowe',
    envNote: 'Ustaw wszystkie trzy we wdrożeniu i wdroż ponownie. Konfiguracja licencji jest czytana raz na proces, więc sama edycja zmiennej nic nie zmieni, dopóki nie wystartuje nowe wdrożenie.',
    privateTitle: 'Klucz prywatny — pokazany raz',
    privateNote: 'Nie jest nigdzie zapisywany. Umieść go teraz w swoim sejfie. Nie da się go odzyskać, a jest jedyną rzeczą zdolną wydać licencję akceptowaną przez to wdrożenie.',
    detailsTitle: 'Zapis',
    licenseId: 'Identyfikator licencji',
    features: 'Funkcje',
    expires: 'Wygasa',
    nextTitle: 'Po zainstalowaniu',
    nextBody: 'Otwórz stronę demonstracji i zgłoś incydent ćwiczebny. Ćwiczenie raportuje werdykt licencji, więc jest uczciwym testem, czy token zadziałał.',
  },
  ru: {
    title: 'Супервизор самовосстановления — настройка лицензии',
    intro: 'Создаёт пару ключей издателя и подписывает лицензию для этого продукта. Три значения ниже вносятся в окружение развёртывания.',
    licensee: 'Лицензия выдана',
    licenseePlaceholder: 'Наименование юридического лица',
    edition: 'Редакция',
    days: 'Срок действия (дней)',
    mint: 'Выпустить лицензию',
    minting: 'Выпуск…',
    needLicensee: 'Укажите сторону, которой выдаётся лицензия.',
    failed: 'Запрос не был завершён',
    resultTitle: 'Лицензия выпущена',
    envTitle: 'Переменные окружения',
    envNote: 'Задайте все три в развёртывании и выполните повторное развёртывание. Конфигурация лицензии читается один раз за процесс, поэтому правка переменной ничего не изменит до старта нового развёртывания.',
    privateTitle: 'Закрытый ключ — показывается один раз',
    privateNote: 'Он нигде не сохраняется. Поместите его в хранилище прямо сейчас. Восстановить его нельзя, и это единственное, чем можно выпустить лицензию, которую примет это развёртывание.',
    detailsTitle: 'Запись',
    licenseId: 'Идентификатор лицензии',
    features: 'Возможности',
    expires: 'Истекает',
    nextTitle: 'После установки',
    nextBody: 'Откройте страницу демонстрации и создайте учебный инцидент. Учение сообщает вердикт лицензии — это честная проверка того, что токен принят.',
  },
}

function pick(value?: string): Language {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'] as Language[]).includes(short as Language) ? (short as Language) : 'en'
}

export default function SupervisorLicensePage() {
  const { lang } = useTranslation()
  const copy = COPY[pick(lang as string)]

  const [licensee, setLicensee] = useState('')
  const [edition, setEdition] = useState('enterprise')
  const [days, setDays] = useState('365')
  const [state, setState] = useState<'idle' | 'running'>('idle')
  const [result, setResult] = useState<MintResult | null>(null)
  const [error, setError] = useState('')

  async function mint() {
    if (state === 'running') return
    if (!licensee.trim()) {
      setError(copy.needLicensee)
      return
    }
    setState('running')
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/supervisor/license/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licensee: licensee.trim(), edition, days: Number(days) || 365 }),
      })
      const payload = (await response.json()) as MintResult
      setResult(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed)
    } finally {
      setState('idle')
    }
  }

  const env = result?.environment

  return (
    <main style={page}>
      <section style={panel}>
        <h1 style={{ marginTop: 0 }}>{copy.title}</h1>
        <p style={muted}>{copy.intro}</p>

        <div style={grid}>
          <label style={field}>
            <span style={label}>{copy.licensee}</span>
            <input value={licensee} onChange={e => setLicensee(e.target.value)} placeholder={copy.licenseePlaceholder} style={input} />
          </label>
          <label style={field}>
            <span style={label}>{copy.edition}</span>
            <select value={edition} onChange={e => setEdition(e.target.value)} style={input}>
              {EDITIONS.map(name => (
                <option key={name} value={name} style={{ color: '#000' }}>{name}</option>
              ))}
            </select>
          </label>
          <label style={field}>
            <span style={label}>{copy.days}</span>
            <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" style={input} />
          </label>
        </div>

        <button type="button" onClick={mint} disabled={state === 'running'} style={{ ...button, cursor: state === 'running' ? 'wait' : 'pointer' }}>
          {state === 'running' ? copy.minting : copy.mint}
        </button>
        {error ? <p role="alert" style={alert}>{error}</p> : null}
        {result?.error ? <p role="alert" style={alert}>{result.error}{result.remedy ? ` — ${result.remedy}` : ''}</p> : null}

        {env ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            <h2 style={{ margin: 0 }}>{copy.resultTitle}</h2>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.envTitle}</h3>
              <p style={muted}>{copy.envNote}</p>
              {Object.entries(env).map(([key, value]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={label}>{key}</div>
                  <textarea readOnly value={value} style={mono} />
                </div>
              ))}
            </section>

            <section style={{ ...card, borderColor: 'rgba(255,176,32,.55)' }}>
              <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.privateTitle}</h3>
              <p style={warn}>{copy.privateNote}</p>
              <textarea readOnly value={result?.privateKeyPem || ''} style={mono} />
            </section>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.detailsTitle}</h3>
              <dl style={grid}>
                <div>
                  <dt style={muted}>{copy.licenseId}</dt>
                  <dd style={dd}>{result?.licence?.licenseId}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.edition}</dt>
                  <dd style={dd}>{result?.licence?.edition}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.expires}</dt>
                  <dd style={dd}>{result?.licence?.expiresAt}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.features}</dt>
                  <dd style={dd}>{(result?.licence?.features || []).join(', ')}</dd>
                </div>
              </dl>
              {result?.warnings?.length ? (
                <ul style={muted}>
                  {result.warnings.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.nextTitle}</h3>
              <p style={muted}>{copy.nextBody}</p>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { maxWidth: 900, margin: '0 auto', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, background: 'rgba(0,0,0,.24)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
const field = { display: 'grid', gap: 6 }
const label = { color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }
const mono = { width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: '#07111f', color: '#c3ccdf', fontFamily: 'ui-monospace, monospace', fontSize: 12, boxSizing: 'border-box' as const }
const button = { border: 0, borderRadius: 12, padding: '14px 20px', marginTop: 16, fontWeight: 900, fontSize: 15, color: '#07111f', background: '#f5c451' }
const dd = { margin: 0, wordBreak: 'break-word' as const, fontWeight: 700 }
const muted = { color: 'rgba(255,255,255,.68)' }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const alert = { color: '#ffb3c1', fontWeight: 700 }
