'use client'

// saas/app/dashboard/marketing/press-providers/PressProviderConnectForm.tsx
// Owner "Connect" UI for a paid press provider (manual path, ONBOARD §12C). Posts to
// /api/agency/press-providers/connect — which vault-encrypts the key and writes the wire's
// provider_registry config. Fully localized (EN/ES/PT/PL/RU) via the platform useI18n() lang.
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY: Record<string, Record<string, string>> = {
  en: { title: 'Connect this provider', apiKey: 'API key', brand: 'Brand (e.g. Business Wire, EIN Presswire)', endpoint: 'Submit endpoint URL', report: 'Report endpoint URL (optional)', price: 'Price per release', currency: 'Currency', advanced: 'Advanced (optional)', payload: 'Payload template (JSON)', refPath: 'Response ID path (default $.id)', connect: 'Connect', connecting: 'Connecting…', connected: 'Connected', perRelease: 'per release', disconnect: 'Disconnect', disconnecting: 'Disconnecting…', keyNote: 'Your key is encrypted and shown only once — the platform never spends on your behalf.', done: 'Connected — you can run campaigns on this wire now.', errGeneric: "Couldn't connect. Check the key and endpoint.", errOwner: 'Sign in as the owner to connect a provider.', errKey: 'An API key is required.', errEndpoint: 'A valid https submit endpoint is required.', errTemplate: "The payload template isn't valid JSON." },
  es: { title: 'Conectar este proveedor', apiKey: 'Clave API', brand: 'Marca (p. ej. Business Wire, EIN Presswire)', endpoint: 'URL del endpoint de envío', report: 'URL del endpoint de informe (opcional)', price: 'Precio por comunicado', currency: 'Moneda', advanced: 'Avanzado (opcional)', payload: 'Plantilla de payload (JSON)', refPath: 'Ruta del ID de respuesta (por defecto $.id)', connect: 'Conectar', connecting: 'Conectando…', connected: 'Conectado', perRelease: 'por comunicado', disconnect: 'Desconectar', disconnecting: 'Desconectando…', keyNote: 'Tu clave se cifra y solo se muestra una vez; la plataforma nunca gasta por ti.', done: 'Conectado: ya puedes lanzar campañas en este cable.', errGeneric: 'No se pudo conectar. Revisa la clave y el endpoint.', errOwner: 'Inicia sesión como propietario para conectar un proveedor.', errKey: 'Se requiere una clave API.', errEndpoint: 'Se requiere un endpoint de envío https válido.', errTemplate: 'La plantilla de payload no es JSON válido.' },
  pt: { title: 'Conectar este provedor', apiKey: 'Chave de API', brand: 'Marca (ex.: Business Wire, EIN Presswire)', endpoint: 'URL do endpoint de envio', report: 'URL do endpoint de relatório (opcional)', price: 'Preço por comunicado', currency: 'Moeda', advanced: 'Avançado (opcional)', payload: 'Modelo de payload (JSON)', refPath: 'Caminho do ID de resposta (padrão $.id)', connect: 'Conectar', connecting: 'Conectando…', connected: 'Conectado', perRelease: 'por comunicado', disconnect: 'Desconectar', disconnecting: 'Desconectando…', keyNote: 'Sua chave é criptografada e exibida apenas uma vez; a plataforma nunca gasta por você.', done: 'Conectado — você já pode executar campanhas neste wire.', errGeneric: 'Não foi possível conectar. Verifique a chave e o endpoint.', errOwner: 'Entre como proprietário para conectar um provedor.', errKey: 'É necessária uma chave de API.', errEndpoint: 'É necessário um endpoint de envio https válido.', errTemplate: 'O modelo de payload não é um JSON válido.' },
  pl: { title: 'Podłącz tego dostawcę', apiKey: 'Klucz API', brand: 'Marka (np. Business Wire, EIN Presswire)', endpoint: 'URL punktu końcowego wysyłki', report: 'URL punktu końcowego raportu (opcjonalnie)', price: 'Cena za komunikat', currency: 'Waluta', advanced: 'Zaawansowane (opcjonalnie)', payload: 'Szablon ładunku (JSON)', refPath: 'Ścieżka ID odpowiedzi (domyślnie $.id)', connect: 'Podłącz', connecting: 'Łączenie…', connected: 'Podłączono', perRelease: 'za komunikat', disconnect: 'Odłącz', disconnecting: 'Odłączanie…', keyNote: 'Twój klucz jest szyfrowany i pokazywany tylko raz; platforma nigdy nie wydaje w Twoim imieniu.', done: 'Podłączono — możesz teraz uruchamiać kampanie na tym wire.', errGeneric: 'Nie udało się połączyć. Sprawdź klucz i punkt końcowy.', errOwner: 'Zaloguj się jako właściciel, aby podłączyć dostawcę.', errKey: 'Wymagany jest klucz API.', errEndpoint: 'Wymagany jest prawidłowy punkt końcowy wysyłki https.', errTemplate: 'Szablon ładunku nie jest prawidłowym JSON-em.' },
  ru: { title: 'Подключить этого провайдера', apiKey: 'API-ключ', brand: 'Бренд (напр. Business Wire, EIN Presswire)', endpoint: 'URL эндпоинта отправки', report: 'URL эндпоинта отчёта (необязательно)', price: 'Цена за релиз', currency: 'Валюта', advanced: 'Дополнительно (необязательно)', payload: 'Шаблон полезной нагрузки (JSON)', refPath: 'Путь к ID ответа (по умолчанию $.id)', connect: 'Подключить', connecting: 'Подключение…', connected: 'Подключено', perRelease: 'за релиз', disconnect: 'Отключить', disconnecting: 'Отключение…', keyNote: 'Ключ шифруется и показывается только один раз; платформа никогда не тратит за вас.', done: 'Подключено — теперь можно запускать кампании на этом wire.', errGeneric: 'Не удалось подключить. Проверьте ключ и эндпоинт.', errOwner: 'Войдите как владелец, чтобы подключить провайдера.', errKey: 'Требуется API-ключ.', errEndpoint: 'Требуется корректный https-эндпоинт отправки.', errTemplate: 'Шаблон полезной нагрузки — некорректный JSON.' },
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
