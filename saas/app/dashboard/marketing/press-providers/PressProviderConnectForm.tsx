'use client'

// saas/app/dashboard/marketing/press-providers/PressProviderConnectForm.tsx
// Owner "Connect" UI for a paid press provider (manual path, ONBOARD §12C). Posts to
// /api/agency/press-providers/connect — which vault-encrypts the key and writes the wire's
// provider_registry config. Fully localized (EN/ES/PT/PL/RU) via the platform useI18n() lang.
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const COPY: Record<string, Record<string, string>> = {
  en: { title: uiText('generatedUi.u_542a1234ef1079f7'), apiKey: uiText('generatedUi.u_16f0ee47f993d627'), brand: uiText('generatedUi.u_4f89f96ae865770e'), endpoint: uiText('generatedUi.u_a6602d0b43b0ae4e'), report: uiText('generatedUi.u_4fe8c862b5dd42a5'), price: uiText('generatedUi.u_adf2978ee7bcd3e8'), currency: uiText('generatedUi.u_3ac1a9ec4fa7a9fa'), advanced: uiText('generatedUi.u_2de7012fcf783970'), payload: uiText('generatedUi.u_5e114cf29d4153e8'), refPath: uiText('generatedUi.u_a46b5a2b1cf04eba'), connect: uiText('generatedUi.u_1a2303ede07493ac'), connecting: uiText('generatedUi.u_72021eb70e91b4d5'), connected: uiText('generatedUi.u_22965568d22a14ee'), perRelease: uiText('generatedUi.u_6ba8194314eb3b66'), disconnect: uiText('generatedUi.u_acfc5be785a9bb3d'), disconnecting: uiText('generatedUi.u_cb2b6a572a8588d8'), keyNote: uiText('generatedUi.u_4b02b77c77942036'), done: uiText('generatedUi.u_0baa3294a2affb1b'), errGeneric: uiText('generatedUi.u_9a0d90df2b8b5782'), errOwner: uiText('generatedUi.u_3596b21f1bf7d5e7'), errKey: uiText('generatedUi.u_9e1cfe1759d79574'), errEndpoint: uiText('generatedUi.u_24392e4eb0e8116d'), errTemplate: uiText('generatedUi.u_03ebe4f40f898e07') },
  es: { title: 'Conectar este proveedor', apiKey: 'Clave API', brand: 'Marca (p. ej. Business Wire, EIN Presswire)', endpoint: 'URL del endpoint de envío', report: 'URL del endpoint de informe (opcional)', price: 'Precio por comunicado', currency: 'Moneda', advanced: 'Avanzado (opcional)', payload: 'Plantilla de payload (JSON)', refPath: 'Ruta del ID de respuesta (por defecto $.id)', connect: 'Conectar', connecting: 'Conectando…', connected: 'Conectado', perRelease: 'por comunicado', disconnect: 'Desconectar', disconnecting: 'Desconectando…', keyNote: 'Tu clave se cifra y solo se muestra una vez; la plataforma nunca gasta por ti.', done: 'Conectado: ya puedes lanzar campañas en este cable.', errGeneric: 'No se pudo conectar. Revisa la clave y el endpoint.', errOwner: 'Inicia sesión como propietario para conectar un proveedor.', errKey: 'Se requiere una clave API.', errEndpoint: 'Se requiere un endpoint de envío https válido.', errTemplate: 'La plantilla de payload no es JSON válido.' },
  pt: { title: 'Conectar este provedor', apiKey: 'Chave de API', brand: 'Marca (ex.: Business Wire, EIN Presswire)', endpoint: 'URL do endpoint de envio', report: 'URL do endpoint de relatório (opcional)', price: 'Preço por comunicado', currency: 'Moeda', advanced: 'Avançado (opcional)', payload: 'Modelo de payload (JSON)', refPath: 'Caminho do ID de resposta (padrão $.id)', connect: 'Conectar', connecting: 'Conectando…', connected: 'Conectado', perRelease: 'por comunicado', disconnect: 'Desconectar', disconnecting: 'Desconectando…', keyNote: 'Sua chave é criptografada e exibida apenas uma vez; a plataforma nunca gasta por você.', done: 'Conectado — você já pode executar campanhas neste wire.', errGeneric: 'Não foi possível conectar. Verifique a chave e o endpoint.', errOwner: 'Entre como proprietário para conectar um provedor.', errKey: 'É necessária uma chave de API.', errEndpoint: 'É necessário um endpoint de envio https válido.', errTemplate: 'O modelo de payload não é um JSON válido.' },
  pl: { title: 'Podłącz tego dostawcę', apiKey: 'Klucz API', brand: 'Marka (np. Business Wire, EIN Presswire)', endpoint: 'URL punktu końcowego wysyłki', report: 'URL punktu końcowego raportu (opcjonalnie)', price: 'Cena za komunikat', currency: 'Waluta', advanced: 'Zaawansowane (opcjonalnie)', payload: 'Szablon ładunku (JSON)', refPath: 'Ścieżka ID odpowiedzi (domyślnie $.id)', connect: 'Podłącz', connecting: 'Łączenie…', connected: 'Podłączono', perRelease: 'za komunikat', disconnect: 'Odłącz', disconnecting: 'Odłączanie…', keyNote: 'Twój klucz jest szyfrowany i pokazywany tylko raz; platforma nigdy nie wydaje w Twoim imieniu.', done: 'Podłączono — możesz teraz uruchamiać kampanie na tym wire.', errGeneric: 'Nie udało się połączyć. Sprawdź klucz i punkt końcowy.', errOwner: 'Zaloguj się jako właściciel, aby podłączyć dostawcę.', errKey: 'Wymagany jest klucz API.', errEndpoint: 'Wymagany jest prawidłowy punkt końcowy wysyłki https.', errTemplate: 'Szablon ładunku nie jest prawidłowym JSON-em.' },
  ru: { title: 'Подключить этого провайдера', apiKey: 'API-ключ', brand: 'Бренд (напр. Business Wire, EIN Presswire)', endpoint: 'URL эндпоинта отправки', report: 'URL эндпоинта отчёта (необязательно)', price: 'Цена за релиз', currency: 'Валюта', advanced: 'Дополнительно (необязательно)', payload: 'Шаблон полезной нагрузки (JSON)', refPath: 'Путь к ID ответа (по умолчанию $.id)', connect: 'Подключить', connecting: 'Подключение…', connected: 'Подключено', perRelease: 'за релиз', disconnect: 'Отключить', disconnecting: 'Отключение…', keyNote: 'Ключ шифруется и показывается только один раз; платформа никогда не тратит за вас.', done: 'Подключено — теперь можно запускать кампании на этом wire.', errGeneric: 'Не удалось подключить. Проверьте ключ и эндпоинт.', errOwner: 'Войдите как владелец, чтобы подключить провайдера.', errKey: 'Требуется API-ключ.', errEndpoint: 'Требуется корректный https-эндпоинт отправки.', errTemplate: 'Шаблон полезной нагрузки — некорректный JSON.' },
  de: { title: 'Diesen Anbieter verbinden', apiKey: 'API-Schlüssel', brand: 'Marke (z. B. Business Wire, EIN Presswire)', endpoint: 'Endpunkt-URL für Übermittlung', report: 'Berichts-Endpunkt-URL (optional)', price: 'Preis pro Pressemitteilung', currency: 'Währung', advanced: 'Erweitert (optional)', payload: 'Payload-Vorlage (JSON)', refPath: 'Pfad der Antwort-ID (Standard $.id)', connect: 'Verbinden', connecting: 'Verbindung wird hergestellt…', connected: 'Verbunden', perRelease: 'pro Veröffentlichung', disconnect: 'Trennen', disconnecting: 'Verbindung wird getrennt…', keyNote: 'Ihr Schlüssel wird verschlüsselt und nur einmal angezeigt – die Plattform gibt niemals in Ihrem Namen Geld aus.', done: 'Verbunden – Sie können jetzt Kampagnen über diesen Newswire ausführen.', errGeneric: 'Verbindung fehlgeschlagen. Prüfen Sie Schlüssel und Endpunkt.', errOwner: 'Melden Sie sich als Eigentümer an, um einen Anbieter zu verbinden.', errKey: 'Ein API-Schlüssel ist erforderlich.', errEndpoint: 'Ein gültiger HTTPS-Übermittlungsendpunkt ist erforderlich.', errTemplate: 'Die Payload-Vorlage ist kein gültiges JSON.' },
  fr: { title: 'Connecter ce fournisseur', apiKey: 'Clé API', brand: 'Marque (ex. Business Wire, EIN Presswire)', endpoint: 'URL du point de terminaison d’envoi', report: 'URL du point de terminaison des rapports (facultatif)', price: 'Prix par communiqué', currency: 'Devise', advanced: 'Avancé (facultatif)', payload: 'Modèle de charge utile (JSON)', refPath: 'Chemin de l’ID de réponse (par défaut $.id)', connect: 'Connecter', connecting: 'Connexion…', connected: 'Connecté', perRelease: 'par publication', disconnect: 'Déconnecter', disconnecting: 'Déconnexion…', keyNote: 'Votre clé est chiffrée et affichée une seule fois — la plateforme ne dépense jamais en votre nom.', done: 'Connecté — vous pouvez désormais lancer des campagnes sur ce fil de presse.', errGeneric: 'Connexion impossible. Vérifiez la clé et le point de terminaison.', errOwner: 'Connectez-vous en tant que propriétaire pour connecter un fournisseur.', errKey: 'Une clé API est requise.', errEndpoint: 'Un point de terminaison de soumission https valide est requis.', errTemplate: 'Le modèle de payload n\'est pas un JSON valide.' },
  it: { title: 'Connetti questo provider', apiKey: 'Chiave API', brand: 'Marchio (es. Business Wire, EIN Presswire)', endpoint: 'URL dell’endpoint di invio', report: 'URL endpoint dei report (facoltativo)', price: 'Prezzo per comunicato', currency: 'Valuta', advanced: 'Avanzate (facoltativo)', payload: 'Modello di payload (JSON)', refPath: 'Percorso dell’ID di risposta (predefinito $.id)', connect: 'Connetti', connecting: 'Connessione in corso…', connected: 'Connesso', perRelease: 'per rilascio', disconnect: 'Disconnetti', disconnecting: 'Disconnessione…', keyNote: 'La tua chiave è crittografata e mostrata una sola volta: la piattaforma non spende mai per tuo conto.', done: 'Connesso: ora puoi eseguire campagne su questo newswire.', errGeneric: 'Impossibile connettersi. Controlla la chiave e l\'endpoint.', errOwner: 'Accedi come proprietario per collegare un provider.', errKey: 'È richiesta una chiave API.', errEndpoint: 'È richiesto un endpoint di invio https valido.', errTemplate: 'Il modello di payload non è un JSON valido.' },
  ja: { title: 'このプロバイダーを接続', apiKey: 'API キー', brand: 'ブランド（例：Business Wire、EIN Presswire）', endpoint: '送信エンドポイント URL', report: 'レポートエンドポイント URL（任意）', price: 'リリースあたりの価格', currency: '通貨', advanced: '詳細設定（任意）', payload: 'ペイロードテンプレート（JSON）', refPath: 'レスポンス ID のパス（デフォルト $.id）', connect: '接続', connecting: '接続中…', connected: '接続済み', perRelease: 'リリースごと', disconnect: '接続解除', disconnecting: '切断中…', keyNote: 'キーは暗号化され、一度だけ表示されます。プラットフォームがお客様に代わって支出することはありません。', done: '接続済み — このワイヤーでキャンペーンを実行できます。', errGeneric: '接続できませんでした。キーとエンドポイントを確認してください。', errOwner: 'プロバイダーを接続するには、オーナーとしてサインインしてください。', errKey: 'API キーが必要です。', errEndpoint: '有効な https 送信エンドポイントが必要です。', errTemplate: 'ペイロードテンプレートが有効な JSON ではありません。' },
  ko: { title: '이 공급자 연결', apiKey: 'API 키', brand: '브랜드(예: Business Wire, EIN Presswire)', endpoint: '제출 엔드포인트 URL', report: '보고서 엔드포인트 URL(선택 사항)', price: '보도 자료당 가격', currency: '통화', advanced: '고급(선택 사항)', payload: '페이로드 템플릿(JSON)', refPath: '응답 ID 경로(기본값 $.id)', connect: '연결', connecting: '연결 중…', connected: '연결됨', perRelease: '릴리스당', disconnect: '연결 해제', disconnecting: '연결 해제 중…', keyNote: '키는 암호화되어 한 번만 표시되며, 플랫폼은 절대 사용자를 대신해 비용을 지출하지 않습니다.', done: '연결됨 — 이제 이 와이어에서 캠페인을 실행할 수 있습니다.', errGeneric: '연결할 수 없습니다. 키와 엔드포인트를 확인하세요.', errOwner: '공급자를 연결하려면 소유자로 로그인하세요.', errKey: 'API 키가 필요합니다.', errEndpoint: '유효한 https 제출 엔드포인트가 필요합니다.', errTemplate: '페이로드 템플릿이 유효한 JSON이 아닙니다.' },
  ar: { title: 'ربط هذا المزوّد', apiKey: 'مفتاح API', brand: 'العلامة التجارية (مثل Business Wire، EIN Presswire)', endpoint: 'URL نقطة نهاية الإرسال', report: 'URL نقطة نهاية التقارير (اختياري)', price: 'السعر لكل بيان', currency: 'العملة', advanced: 'متقدم (اختياري)', payload: 'قالب الحمولة (JSON)', refPath: 'مسار معرّف الاستجابة (الافتراضي $.id)', connect: 'اتصال', connecting: 'جارٍ الاتصال…', connected: 'متصل', perRelease: 'لكل إصدار', disconnect: 'قطع الاتصال', disconnecting: 'جارٍ قطع الاتصال…', keyNote: 'مفتاحك مشفّر ويُعرض مرة واحدة فقط — ولا تنفق المنصة أبدًا نيابةً عنك.', done: 'متصل — يمكنك الآن تشغيل الحملات على هذه الوكالة الإخبارية.', errGeneric: 'تعذّر الاتصال. تحقق من المفتاح ونقطة النهاية.', errOwner: 'سجّل الدخول بصفتك المالك لربط مزوّد.', errKey: 'مفتاح API مطلوب.', errEndpoint: 'يلزم توفير نقطة نهاية إرسال https صالحة.', errTemplate: 'قالب الحمولة ليس JSON صالحًا.' },
}

const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box', fontSize: 13 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }

function errText(code: string, t: Record<string, string>) {
  if (code === 'owner_session_required' || code === 'owner_approval_required') return t.errOwner
  if (code === 'api_key_required') return t.errKey
  if (code === 'valid_endpoint_required') return t.errEndpoint
  if (code === 'payload_template_invalid_json') return t.errTemplate
  return t.errGeneric
}

export default function PressProviderConnectForm(props: {
  providerId: string
  connected?: boolean
  brand?: string | null
  priceCents?: number
  currency?: string
  onChanged?: () => void
}) {
  const { lang } = useI18n()
  const t = COPY[lang] || COPY.en

  const [apiKey, setApiKey] = useState('')
  const [brand, setBrand] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [report, setReport] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [refPath, setRefPath] = useState('')
  const [payload, setPayload] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)

  async function connect() {
    setBusy(true); setMessage(''); setOk(false)
    try {
      const res = await fetch('/api/agency/press-providers/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          provider_id: props.providerId, api_key: apiKey, brand, endpoint,
          report_endpoint: report, ref_path: refPath, payload_template: payload || undefined,
          price_cents: price ? Math.round(parseFloat(price) * 100) : 0, currency,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(errText(json.error || '', t))
      setOk(true); setMessage(t.done); setApiKey(''); props.onChanged?.()
    } catch (err: any) { setMessage(err?.message || t.errGeneric) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/agency/press-providers/connect', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ provider_id: props.providerId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(errText(json.error || '', t))
      props.onChanged?.()
    } catch (err: any) { setMessage(err?.message || t.errGeneric) }
    finally { setBusy(false) }
  }

  if (props.connected) {
    const priceLabel = props.priceCents ? `${(props.priceCents / 100).toFixed(2)} ${props.currency || 'USD'} ${t.perRelease}` : ''
    return <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      <span style={{ color: '#22c55e', fontWeight: 900, fontSize: 12 }}>● {t.connected}{props.brand ? ` · ${props.brand}` : ''}{priceLabel ? ` · ${priceLabel}` : ''}</span>
      <button style={ghost} disabled={busy} onClick={disconnect}>{busy ? t.disconnecting : t.disconnect}</button>
      {message ? <span style={{ color: '#fb923c', fontSize: 12 }}>{message}</span> : null}
    </div>
  }

  return <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
    <p style={{ color: '#fff', fontWeight: 850, fontSize: 13, margin: 0 }}>{t.title}</p>
    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t.apiKey} type="password" style={field} />
    <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t.brand} style={field} />
    <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={t.endpoint} style={field} />
    <div style={{ display: 'flex', gap: 8 }}>
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t.price} inputMode="decimal" style={{ ...field, flex: 2 }} />
      <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} placeholder={t.currency} style={{ ...field, flex: 1 }} />
    </div>
    <button style={{ ...ghost, justifySelf: 'start', fontSize: 12 }} onClick={() => setShowAdvanced((v) => !v)}>{t.advanced}</button>
    {showAdvanced ? <div style={{ display: 'grid', gap: 8 }}>
      <input value={report} onChange={(e) => setReport(e.target.value)} placeholder={t.report} style={field} />
      <input value={refPath} onChange={(e) => setRefPath(e.target.value)} placeholder={t.refPath} style={field} />
      <textarea value={payload} onChange={(e) => setPayload(e.target.value)} placeholder={t.payload} rows={3} style={{ ...field, resize: 'vertical', fontFamily: 'monospace' }} />
    </div> : null}
    <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: 0 }}>{t.keyNote}</p>
    <button style={button} disabled={busy || !apiKey.trim() || !endpoint.trim()} onClick={connect}>{busy ? t.connecting : t.connect}</button>
    {message ? <p style={{ color: ok ? '#22c55e' : '#fb923c', fontSize: 12, margin: 0 }}>{message}</p> : null}
  </div>
}
