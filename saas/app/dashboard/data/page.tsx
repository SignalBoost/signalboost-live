'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:      { en: 'Data', es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные' },
  title:        { en: 'Universal Data Connector', es: 'Conector universal de datos', pt: 'Conector universal de dados', pl: 'Uniwersalny łącznik danych', ru: 'Универсальный коннектор данных' },
  subtitle:     { en: 'Bring your catalog into SignalBoost from a CSV, a live API, or scraper output — then reuse it across sites, reviews, and outreach.', es: 'Importa tu catálogo a SignalBoost desde un CSV, una API en vivo o un scraper — y reutilízalo en sitios, reseñas y prospección.', pt: 'Traga seu catálogo para o SignalBoost via CSV, API ao vivo ou scraper — e reutilize em sites, avaliações e prospecção.', pl: 'Wprowadź swój katalog do SignalBoost z CSV, API lub scrapera — i używaj go na stronach, w opiniach i outreachu.', ru: 'Импортируйте каталог в SignalBoost из CSV, API или скрейпера — и используйте его на сайтах, в отзывах и аутриче.' },
  tItems:       { en: 'Items imported', es: 'Elementos importados', pt: 'Itens importados', pl: 'Zaimportowane', ru: 'Импортировано' },
  tCategories:  { en: 'Categories', es: 'Categorías', pt: 'Categorias', pl: 'Kategorie', ru: 'Категории' },
  tSources:     { en: 'Sources', es: 'Fuentes', pt: 'Fontes', pl: 'Źródła', ru: 'Источники' },
  csvTitle:     { en: 'Upload CSV', es: 'Subir CSV', pt: 'Enviar CSV', pl: 'Prześlij CSV', ru: 'Загрузить CSV' },
  csvHint:      { en: 'Header row + one item per line', es: 'Fila de encabezado + un elemento por línea', pt: 'Linha de cabeçalho + um item por linha', pl: 'Wiersz nagłówka + jeden element na linię', ru: 'Строка заголовка + один элемент на строку' },
  csvLabel:     { en: 'CSV content', es: 'Contenido CSV', pt: 'Conteúdo CSV', pl: 'Zawartość CSV', ru: 'Содержимое CSV' },
  csvBtn:       { en: 'Import CSV', es: 'Importar CSV', pt: 'Importar CSV', pl: 'Importuj CSV', ru: 'Импорт CSV' },
  apiTitle:     { en: 'API connector', es: 'Conector API', pt: 'Conector API', pl: 'Łącznik API', ru: 'API-коннектор' },
  apiHint:      { en: 'Pull items from a live endpoint', es: 'Obtén elementos de un endpoint en vivo', pt: 'Busque itens de um endpoint ao vivo', pl: 'Pobieraj elementy z endpointu', ru: 'Получайте элементы из эндпоинта' },
  apiEndpoint:  { en: 'Endpoint URL', es: 'URL del endpoint', pt: 'URL do endpoint', pl: 'Adres endpointu', ru: 'URL эндпоинта' },
  apiMapping:   { en: 'Field mapping (JSON)', es: 'Mapeo de campos (JSON)', pt: 'Mapeamento de campos (JSON)', pl: 'Mapowanie pól (JSON)', ru: 'Сопоставление полей (JSON)' },
  apiBtn:       { en: 'Run API import', es: 'Ejecutar importación API', pt: 'Executar importação API', pl: 'Uruchom import API', ru: 'Запустить импорт API' },
  scrTitle:     { en: 'Scraper connector', es: 'Conector de scraper', pt: 'Conector de scraper', pl: 'Łącznik scrapera', ru: 'Скрейпер-коннектор' },
  scrHint:      { en: 'Paste structured scraper output', es: 'Pega la salida estructurada del scraper', pt: 'Cole a saída estruturada do scraper', pl: 'Wklej dane wyjściowe scrapera', ru: 'Вставьте структурированный вывод скрейпера' },
  scrLabel:     { en: 'Items (JSON array)', es: 'Elementos (arreglo JSON)', pt: 'Itens (array JSON)', pl: 'Elementy (tablica JSON)', ru: 'Элементы (JSON-массив)' },
  scrBtn:       { en: 'Run scraper import', es: 'Ejecutar importación', pt: 'Executar importação', pl: 'Uruchom import', ru: 'Запустить импорт' },
  importing:    { en: 'Importing…', es: 'Importando…', pt: 'Importando…', pl: 'Importowanie…', ru: 'Импорт…' },
  done:         { en: 'Done — {count} item(s) inserted', es: 'Listo — {count} elemento(s) insertado(s)', pt: 'Pronto — {count} item(ns) inserido(s)', pl: 'Gotowe — {count} element(ów) dodano', ru: 'Готово — добавлено {count} элемент(ов)' },
  invalidJson:  { en: 'That JSON could not be parsed — check the syntax and try again.', es: 'No se pudo analizar el JSON — revisa la sintaxis e inténtalo de nuevo.', pt: 'Não foi possível analisar o JSON — verifique a sintaxe e tente novamente.', pl: 'Nie udało się przetworzyć JSON — sprawdź składnię i spróbuj ponownie.', ru: 'Не удалось разобрать JSON — проверьте синтаксис и повторите.' },
  failed:       { en: 'Import failed: {error}', es: 'Importación fallida: {error}', pt: 'Falha na importação: {error}', pl: 'Import nieudany: {error}', ru: 'Импорт не удался: {error}' },
  itemsTitle:   { en: 'Imported items by category', es: 'Elementos importados por categoría', pt: 'Itens importados por categoria', pl: 'Zaimportowane elementy wg kategorii', ru: 'Импортированные элементы по категориям' },
  itemsEmpty:   { en: 'Nothing imported yet. Run any connector above and your items will appear here, grouped by category.', es: 'Aún no hay importaciones. Ejecuta un conector arriba y tus elementos aparecerán aquí, agrupados por categoría.', pt: 'Nada importado ainda. Execute um conector acima e seus itens aparecerão aqui, agrupados por categoria.', pl: 'Jeszcze nic nie zaimportowano. Uruchom łącznik powyżej, a elementy pojawią się tutaj pogrupowane.', ru: 'Пока ничего не импортировано. Запустите коннектор выше — элементы появятся здесь по категориям.' },
  srcTitle:     { en: 'Source history', es: 'Historial de fuentes', pt: 'Histórico de fontes', pl: 'Historia źródeł', ru: 'История источников' },
  srcEmpty:     { en: 'No sources yet — each import is logged here with its type and time.', es: 'Sin fuentes aún — cada importación se registra aquí con su tipo y hora.', pt: 'Sem fontes ainda — cada importação é registrada aqui com tipo e hora.', pl: 'Brak źródeł — każdy import jest tu rejestrowany z typem i czasem.', ru: 'Источников пока нет — каждый импорт фиксируется здесь с типом и временем.' },
  loading:      { en: 'Loading your imports…', es: 'Cargando tus importaciones…', pt: 'Carregando suas importações…', pl: 'Ładowanie importów…', ru: 'Загрузка импортов…' },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

type HistoryPayload = {
  groupedItems: Record<string, Array<{ id: string; name: string; description?: string; source_url?: string }>>
  sources: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>
}

export default function DataConnectorsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [csvText, setCsvText] = useState('name,category,description,image_url,source_url\nFC Barcelona,Football Teams,Spanish football club,https://example.com/barca.jpg,https://www.fcbarcelona.com')
  const [apiEndpoint, setApiEndpoint] = useState('https://example.com/api/items')
  const [apiMapping, setApiMapping] = useState('{"name":"name","category":"category","description":"description","image_url":"image","source_url":"url"}')
  const [scraperJson, setScraperJson] = useState('[{"name":"Louvre Museum","category":"Museums","description":"Museum in Paris","image_url":"https://example.com/louvre.jpg","source_url":"https://www.louvre.fr"}]')
  const [history, setHistory] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text: string }>({ kind: 'idle', text: '' })

  async function refresh() {
    try {
      const res = await fetch('/api/data-connectors/history')
      const data = await res.json()
      setHistory(data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function submit(payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    setStatus({ kind: 'busy', text: c(COPY.importing, l) })
    try {
      const res = await fetch('/api/data-connectors/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ kind: 'ok', text: c(COPY.done, l).replace('{count}', String(data.inserted ?? 0)) })
        refresh()
      } else {
        setStatus({ kind: 'err', text: c(COPY.failed, l).replace('{error}', String(data.error)) })
      }
    } catch (e) {
      setStatus({ kind: 'err', text: c(COPY.failed, l).replace('{error}', e instanceof Error ? e.message : 'network') })
    } finally {
      setBusy(false)
    }
  }

  function runApi() {
    try {
      const mapping = JSON.parse(apiMapping)
      submit({ mode: 'api', endpoint: apiEndpoint, mapping, config: { label: 'API import' } })
    } catch {
      setStatus({ kind: 'err', text: c(COPY.invalidJson, l) })
    }
  }

  function runScraper() {
    try {
      const json = JSON.parse(scraperJson)
      submit({ mode: 'scraper', json, config: { script: 'custom scraper output' } })
    } catch {
      setStatus({ kind: 'err', text: c(COPY.invalidJson, l) })
    }
  }

  const itemCount = Object.values(history.groupedItems).reduce((n, arr) => n + arr.length, 0)
  const categoryCount = Object.keys(history.groupedItems).length

  return (
    <div style={{ color: 'var(--text-primary)' }}>

      <header className="sb-console">
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">🗄️ {c(COPY.eyebrow, l)}</span>
            <h1>{c(COPY.title, l)}</h1>
            <p className="sb-body">{c(COPY.subtitle, l)}</p>
          </div>
        </div>
        <div className="sb-telemetry">
          <div><b className="gold">{itemCount}</b><span>{c(COPY.tItems, l)}</span></div>
          <div><b>{categoryCount}</b><span>{c(COPY.tCategories, l)}</span></div>
          <div><b>{history.sources.length}</b><span>{c(COPY.tSources, l)}</span></div>
        </div>
      </header>

      {status.kind !== 'idle' ? (
        <p style={{ marginBottom: 16 }}>
          <span className={`sb-chip ${status.kind === 'ok' ? 'sb-chip--ok' : status.kind === 'err' ? 'sb-chip--err' : 'sb-chip--gold'}`}>{status.text}</span>
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <section className="sb-panel" style={{ marginBottom: 0 }}>
          <div className="sb-panel__head"><h2>📄 {c(COPY.csvTitle, l)}</h2><span className="sb-caption">{c(COPY.csvHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.csvLabel, l)}</span>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => submit({ mode: 'csv', csvText, fileName: 'manual.csv' })}>{c(COPY.csvBtn, l)}</button>
        </section>

        <section className="sb-panel" style={{ marginBottom: 0 }}>
          <div className="sb-panel__head"><h2>🔌 {c(COPY.apiTitle, l)}</h2><span className="sb-caption">{c(COPY.apiHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.apiEndpoint, l)}</span>
            <input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} />
          </label>
          <label className="sb-field"><span>{c(COPY.apiMapping, l)}</span>
            <textarea value={apiMapping} onChange={(e) => setApiMapping(e.target.value)} style={{ minHeight: 80 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runApi}>{c(COPY.apiBtn, l)}</button>
        </section>

        <section className="sb-panel" style={{ marginBottom: 0 }}>
          <div className="sb-panel__head"><h2>🕸️ {c(COPY.scrTitle, l)}</h2><span className="sb-caption">{c(COPY.scrHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.scrLabel, l)}</span>
            <textarea value={scraperJson} onChange={(e) => setScraperJson(e.target.value)} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runScraper}>{c(COPY.scrBtn, l)}</button>
        </section>
      </div>

      <section className="sb-panel">
        <div className="sb-panel__head"><h2>📦 {c(COPY.itemsTitle, l)}</h2><span className="sb-caption">{itemCount} · {categoryCount}</span></div>
        {loading ? (
          <p className="sb-body" style={{ fontSize: 13 }}>{c(COPY.loading, l)}</p>
        ) : itemCount === 0 ? (
          <div className="sb-empty">{c(COPY.itemsEmpty, l)}</div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {Object.entries(history.groupedItems).map(([category, items]) => (
              <div key={category}>
                <p style={{ margin: '0 0 8px' }}><span className="sb-chip sb-chip--gold">{category}</span> <span className="sb-caption">{items.length}</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,.03)' }}>
                      <strong style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>{item.name}</strong>
                      {item.description ? <span className="sb-caption" style={{ display: 'block' }}>{item.description}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sb-panel">
        <div className="sb-panel__head"><h2>🧾 {c(COPY.srcTitle, l)}</h2><span className="sb-caption">{history.sources.length}</span></div>
        {loading ? (
          <p className="sb-body" style={{ fontSize: 13 }}>{c(COPY.loading, l)}</p>
        ) : history.sources.length === 0 ? (
          <div className="sb-empty">{c(COPY.srcEmpty, l)}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {history.sources.map((source) => (
              <div key={source.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '10px 14px', background: 'rgba(255,255,255,.02)' }}>
                <span className="sb-chip">{source.type}</span>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{new Date(source.created_at).toLocaleString()}</span>
                <span className="sb-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{JSON.stringify(source.config)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
