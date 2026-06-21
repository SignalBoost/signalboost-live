'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:       { en: 'Data', es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные' },
  title:         { en: 'Universal Data Connector', es: 'Conector universal de datos', pt: 'Conector universal de dados', pl: 'Uniwersalny łącznik danych', ru: 'Универсальный коннектор данных' },
  subtitle:      { en: 'Bring your catalog into SignalBoost from a CSV, a live API, or scraper output — then reuse it across sites, reviews, and outreach.', es: 'Importa tu catálogo a SignalBoost desde un CSV, una API en vivo o un scraper — y reutilízalo en sitios, reseñas y prospección.', pt: 'Traga seu catálogo para o SignalBoost via CSV, API ao vivo ou scraper — e reutilize em sites, avaliações e prospecção.', pl: 'Wprowadź swój katalog do SignalBoost z CSV, API lub scrapera — i używaj go na stronach, w opiniach i outreachu.', ru: 'Импортируйте каталог в SignalBoost из CSV, API или скрейпера — и используйте его на сайтах, в отзывах и аутриче.' },
  tItems:        { en: 'Items imported', es: 'Elementos importados', pt: 'Itens importados', pl: 'Zaimportowane', ru: 'Импортировано' },
  tCategories:   { en: 'Categories', es: 'Categorías', pt: 'Categorias', pl: 'Kategorie', ru: 'Категории' },
  tSources:      { en: 'Sources', es: 'Fuentes', pt: 'Fontes', pl: 'Źródła', ru: 'Источники' },
  /* ── Drop zone ── */
  dropTitle:     { en: 'Drop files or a folder here', es: 'Suelta archivos o una carpeta aquí', pt: 'Solte arquivos ou uma pasta aqui', pl: 'Upuść pliki lub folder tutaj', ru: 'Перетащите файлы или папку сюда' },
  dropSub:       { en: 'CSV and JSON files supported · or click to browse', es: 'Archivos CSV y JSON · o haz clic para explorar', pt: 'Arquivos CSV e JSON · ou clique para procurar', pl: 'Pliki CSV i JSON · lub kliknij, aby przeglądać', ru: 'Файлы CSV и JSON · или нажмите для выбора' },
  dropFolder:    { en: 'Upload folder', es: 'Subir carpeta', pt: 'Enviar pasta', pl: 'Prześlij folder', ru: 'Загрузить папку' },
  dropFiles:     { en: 'Upload files', es: 'Subir archivos', pt: 'Enviar arquivos', pl: 'Prześlij pliki', ru: 'Загрузить файлы' },
  queueTitle:    { en: 'Upload queue', es: 'Cola de carga', pt: 'Fila de envio', pl: 'Kolejka przesyłania', ru: 'Очередь загрузки' },
  queueClear:    { en: 'Clear done', es: 'Limpiar completados', pt: 'Limpar concluídos', pl: 'Wyczyść gotowe', ru: 'Очистить завершённые' },
  queueImportAll:{ en: 'Import all pending', es: 'Importar todos pendientes', pt: 'Importar todos pendentes', pl: 'Importuj wszystkie oczekujące', ru: 'Импортировать все ожидающие' },
  queueEmpty:    { en: 'No files queued yet — drag files or a folder above.', es: 'No hay archivos en cola — arrastra archivos o una carpeta arriba.', pt: 'Nenhum arquivo na fila — arraste arquivos ou uma pasta acima.', pl: 'Brak plików w kolejce — przeciągnij pliki lub folder powyżej.', ru: 'Очередь пуста — перетащите файлы или папку выше.' },
  statusPending: { en: 'Pending', es: 'Pendiente', pt: 'Pendente', pl: 'Oczekuje', ru: 'Ожидает' },
  statusImporting:{ en: 'Importing…', es: 'Importando…', pt: 'Importando…', pl: 'Importowanie…', ru: 'Импорт…' },
  statusDone:    { en: 'Done', es: 'Listo', pt: 'Pronto', pl: 'Gotowe', ru: 'Готово' },
  statusError:   { en: 'Error', es: 'Error', pt: 'Erro', pl: 'Błąd', ru: 'Ошибка' },
  unsupported:   { en: 'Only .csv and .json files are supported.', es: 'Solo se admiten archivos .csv y .json.', pt: 'Apenas arquivos .csv e .json são suportados.', pl: 'Obsługiwane są tylko pliki .csv i .json.', ru: 'Поддерживаются только файлы .csv и .json.' },
  /* ── CSV panel ── */
  csvTitle:      { en: 'Upload CSV', es: 'Subir CSV', pt: 'Enviar CSV', pl: 'Prześlij CSV', ru: 'Загрузить CSV' },
  csvHint:       { en: 'Header row + one item per line', es: 'Fila de encabezado + un elemento por línea', pt: 'Linha de cabeçalho + um item por linha', pl: 'Wiersz nagłówka + jeden element na linię', ru: 'Строка заголовка + один элемент на строку' },
  csvLabel:      { en: 'CSV content', es: 'Contenido CSV', pt: 'Conteúdo CSV', pl: 'Zawartość CSV', ru: 'Содержимое CSV' },
  csvBtn:        { en: 'Import CSV', es: 'Importar CSV', pt: 'Importar CSV', pl: 'Importuj CSV', ru: 'Импорт CSV' },
  /* ── API panel ── */
  apiTitle:      { en: 'API connector', es: 'Conector API', pt: 'Conector API', pl: 'Łącznik API', ru: 'API-коннектор' },
  apiHint:       { en: 'Pull items from a live endpoint', es: 'Obtén elementos de un endpoint en vivo', pt: 'Busque itens de um endpoint ao vivo', pl: 'Pobieraj elementy z endpointu', ru: 'Получайте элементы из эндпоинта' },
  apiEndpoint:   { en: 'Endpoint URL', es: 'URL del endpoint', pt: 'URL do endpoint', pl: 'Adres endpointu', ru: 'URL эндпоинта' },
  apiMapping:    { en: 'Field mapping (JSON)', es: 'Mapeo de campos (JSON)', pt: 'Mapeamento de campos (JSON)', pl: 'Mapowanie pól (JSON)', ru: 'Сопоставление полей (JSON)' },
  apiBtn:        { en: 'Run API import', es: 'Ejecutar importación API', pt: 'Executar importação API', pl: 'Uruchom import API', ru: 'Запустить импорт API' },
  /* ── Scraper panel ── */
  scrTitle:      { en: 'Scraper connector', es: 'Conector de scraper', pt: 'Conector de scraper', pl: 'Łącznik scrapera', ru: 'Скрейпер-коннектор' },
  scrHint:       { en: 'Paste structured scraper output', es: 'Pega la salida estructurada del scraper', pt: 'Cole a saída estruturada do scraper', pl: 'Wklej dane wyjściowe scrapera', ru: 'Вставьте структурированный вывод скрейпера' },
  scrLabel:      { en: 'Items (JSON array)', es: 'Elementos (arreglo JSON)', pt: 'Itens (array JSON)', pl: 'Elementy (tablica JSON)', ru: 'Элементы (JSON-массив)' },
  scrBtn:        { en: 'Run scraper import', es: 'Ejecutar importación', pt: 'Executar importação', pl: 'Uruchom import', ru: 'Запустить импорт' },
  /* ── shared ── */
  importing:     { en: 'Importing…', es: 'Importando…', pt: 'Importando…', pl: 'Importowanie…', ru: 'Импорт…' },
  done:          { en: 'Done — {count} item(s) inserted', es: 'Listo — {count} elemento(s) insertado(s)', pt: 'Pronto — {count} item(ns) inserido(s)', pl: 'Gotowe — {count} element(ów) dodano', ru: 'Готово — добавлено {count} элемент(ов)' },
  invalidJson:   { en: 'That JSON could not be parsed — check the syntax and try again.', es: 'No se pudo analizar el JSON — revisa la sintaxis e inténtalo de nuevo.', pt: 'Não foi possível analisar o JSON — verifique a sintaxe e tente novamente.', pl: 'Nie udało się przetworzyć JSON — sprawdź składnię i spróbuj ponownie.', ru: 'Не удалось разобрать JSON — проверьте синтаксис и повторите.' },
  failed:        { en: 'Import failed: {error}', es: 'Importación fallida: {error}', pt: 'Falha na importação: {error}', pl: 'Import nieudany: {error}', ru: 'Импорт не удался: {error}' },
  itemsTitle:    { en: 'Imported items by category', es: 'Elementos importados por categoría', pt: 'Itens importados por categoria', pl: 'Zaimportowane elementy wg kategorii', ru: 'Импортированные элементы по категориям' },
  itemsEmpty:    { en: 'Nothing imported yet. Run any connector above and your items will appear here, grouped by category.', es: 'Aún no hay importaciones. Ejecuta un conector arriba y tus elementos aparecerán aquí, agrupados por categoría.', pt: 'Nada importado ainda. Execute um conector acima e seus itens aparecerão aqui, agrupados por categoria.', pl: 'Jeszcze nic nie zaimportowano. Uruchom łącznik powyżej, a elementy pojawią się tutaj pogrupowane.', ru: 'Пока ничего не импортировано. Запустите коннектор выше — элементы появятся здесь по категориям.' },
  srcTitle:      { en: 'Source history', es: 'Historial de fuentes', pt: 'Histórico de fontes', pl: 'Historia źródeł', ru: 'История источников' },
  srcEmpty:      { en: 'No sources yet — each import is logged here with its type and time.', es: 'Sin fuentes aún — cada importación se registra aquí con su tipo y hora.', pt: 'Sem fontes ainda — cada importação é registrada aqui com tipo e hora.', pl: 'Brak źródeł — każdy import jest tu rejestrowany z typem i czasem.', ru: 'Источников пока нет — каждый импорт фиксируется здесь с типом и временем.' },
  loading:       { en: 'Loading your imports…', es: 'Cargando tus importaciones…', pt: 'Carregando suas importações…', pl: 'Ładowanie importów…', ru: 'Загрузка импортов…' },
}

function c(obj: Record<Lang, string>, lang: Lang): string {
  return obj?.[lang] ?? obj?.en ?? ''
}

type QueueItem = {
  id: string
  name: string
  ext: 'csv' | 'json'
  content: string
  status: 'pending' | 'importing' | 'done' | 'error'
  message: string
}

type HistoryPayload = {
  groupedItems: Record<string, Array<{ id: string; name: string; description?: string; source_url?: string }>>
  sources: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>
}

function statusColor(s: QueueItem['status']): string {
  if (s === 'done') return '#1af0ff'
  if (s === 'error') return '#ff4d4d'
  if (s === 'importing') return '#ffc300'
  return 'rgba(255,255,255,.45)'
}

function statusDot(s: QueueItem['status']): string {
  if (s === 'done') return '✓'
  if (s === 'error') return '✕'
  if (s === 'importing') return '⟳'
  return '○'
}

export default function DataConnectorsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  /* ── existing connector state ── */
  const [csvText, setCsvText] = useState('name,category,description,image_url,source_url\nFC Barcelona,Football Teams,Spanish football club,https://example.com/barca.jpg,https://www.fcbarcelona.com')
  const [apiEndpoint, setApiEndpoint] = useState('https://example.com/api/items')
  const [apiMapping, setApiMapping] = useState('{"name":"name","category":"category","description":"description","image_url":"image","source_url":"url"}')
  const [scraperJson, setScraperJson] = useState('[{"name":"Louvre Museum","category":"Museums","description":"Museum in Paris","image_url":"https://example.com/louvre.jpg","source_url":"https://www.louvre.fr"}]')
  const [history, setHistory] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text: string }>({ kind: 'idle', text: '' })

  /* ── drag-drop / upload queue state ── */
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  async function refresh() {
    try {
      const res = await fetch('/api/data-connectors/history')
      const data = await res.json()
      setHistory(data)
    } catch { } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  /* ── existing connectors submit ── */
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

  /* ── file reading helper ── */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('File read error'))
      reader.readAsText(file)
    })
  }

  /* ── enqueue files ── */
  const enqueueFiles = useCallback(async (files: File[]) => {
    const supported = files.filter(f => f.name.endsWith('.csv') || f.name.endsWith('.json'))
    if (supported.length === 0) {
      setStatus({ kind: 'err', text: c(COPY.unsupported, l) })
      return
    }
    const newItems: QueueItem[] = await Promise.all(
      supported.map(async (file) => {
        const content = await readFileAsText(file)
        const ext = file.name.endsWith('.json') ? 'json' : 'csv'
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          ext,
          content,
          status: 'pending' as const,
          message: '',
        }
      })
    )
    setQueue(prev => [...prev, ...newItems])
  }, [l])

  /* ── drag events ── */
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setDragging(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []

    async function traverseEntry(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          (entry as FileSystemFileEntry).file((f) => { files.push(f); resolve() })
        })
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        await new Promise<void>((resolve) => {
          reader.readEntries(async (entries) => {
            for (const child of entries) {
              await traverseEntry(child)
            }
            resolve()
          })
        })
      }
    }

    const traversals: Promise<void>[] = []
    for (const item of items) {
      const entry = item.webkitGetAsEntry()
      if (entry) traversals.push(traverseEntry(entry))
    }
    await Promise.all(traversals)

    if (files.length > 0) {
      await enqueueFiles(files)
    }
  }

  /* ── file input change ── */
  async function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) await enqueueFiles(files)
    e.target.value = ''
  }

  /* ── import a single queue item ── */
  async function importQueueItem(id: string) {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'importing', message: '' } : item))
    const item = queue.find(q => q.id === id)
    if (!item) return

    try {
      let payload: Record<string, unknown>
      if (item.ext === 'csv') {
        payload = { mode: 'csv', csvText: item.content, fileName: item.name }
      } else {
        let json: unknown
        try { json = JSON.parse(item.content) } catch {
          throw new Error('Invalid JSON')
        }
        payload = { mode: 'scraper', json, config: { script: item.name } }
      }

      const res = await fetch('/api/data-connectors/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'done', message: `${data.inserted ?? 0} items` } : q))
        refresh()
      } else {
        setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', message: String(data.error) } : q))
      }
    } catch (e) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', message: e instanceof Error ? e.message : 'unknown' } : q))
    }
  }

  /* ── import all pending ── */
  async function importAllPending() {
    if (queueBusy) return
    setQueueBusy(true)
    const pending = queue.filter(q => q.status === 'pending')
    for (const item of pending) {
      await importQueueItem(item.id)
    }
    setQueueBusy(false)
  }

  function clearDone() {
    setQueue(prev => prev.filter(q => q.status !== 'done'))
  }

  const itemCount = Object.values(history.groupedItems).reduce((n, arr) => n + arr.length, 0)
  const categoryCount = Object.keys(history.groupedItems).length
  const pendingCount = queue.filter(q => q.status === 'pending').length

  return (
    <div style={{ color: 'var(--text-primary)' }}>

      {/* ── header ── */}
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">🗄️ {c(COPY.eyebrow, l)}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{c(COPY.title, l)}</h1>
          </div>
          <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
            <div style={{ paddingTop: 0 }}><b className="gold">{itemCount}</b><span>{c(COPY.tItems, l)}</span></div>
            <div style={{ paddingTop: 0 }}><b>{categoryCount}</b><span>{c(COPY.tCategories, l)}</span></div>
            <div style={{ paddingTop: 0 }}><b>{history.sources.length}</b><span>{c(COPY.tSources, l)}</span></div>
          </div>
        </div>
      </header>

      {/* ── global status chip ── */}
      {status.kind !== 'idle' && (
        <p style={{ marginBottom: 16 }}>
          <span className={`sb-chip ${status.kind === 'ok' ? 'sb-chip--ok' : status.kind === 'err' ? 'sb-chip--err' : 'sb-chip--gold'}`}>{status.text}</span>
        </p>
      )}

      {/* ══════════════════════════════════════════════════
          DRAG & DROP UPLOAD ZONE
      ══════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 20 }}>
        {/* drop zone */}
        <div
          ref={dropRef}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            position: 'relative',
            border: `2px dashed ${dragging ? '#ffc300' : 'rgba(255,255,255,.18)'}`,
            borderRadius: 20,
            padding: '36px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color .2s, background .2s',
            background: dragging
              ? 'linear-gradient(160deg, rgba(255,195,0,.08), rgba(26,240,255,.06))'
              : 'linear-gradient(160deg, rgba(15,23,42,.7), rgba(3,7,18,.8))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: dragging ? '0 0 0 4px rgba(255,195,0,.18), 0 24px 70px rgba(0,0,0,.5)' : '0 24px 70px rgba(0,0,0,.4)',
            userSelect: 'none',
          }}
        >
          {/* icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: dragging ? 'rgba(255,195,0,.15)' : 'rgba(255,255,255,.06)',
            border: `1px solid ${dragging ? 'rgba(255,195,0,.4)' : 'rgba(255,255,255,.1)'}`,
            fontSize: 28, transition: 'all .2s',
          }}>
            {dragging ? '📂' : '📁'}
          </div>

          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: dragging ? '#ffc300' : '#fff' }}>
            {c(COPY.dropTitle, l)}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0 }}>
            {c(COPY.dropSub, l)}
          </p>

          {/* overlay pulse ring when dragging */}
          {dragging && (
            <div style={{
              position: 'absolute', inset: -2, borderRadius: 22,
              border: '2px solid rgba(255,195,0,.35)',
              pointerEvents: 'none',
              animation: 'none',
            }} />
          )}
        </div>

        {/* hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          multiple
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          /* @ts-ignore — webkitdirectory is non-standard but widely supported */
          webkitdirectory=""
          multiple
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />

        {/* action buttons below drop zone */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className="sb-button-secondary"
            style={{ border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          >
            📄 {c(COPY.dropFiles, l)}
          </button>
          <button
            className="sb-button-secondary"
            style={{ border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
          >
            📂 {c(COPY.dropFolder, l)}
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          UPLOAD QUEUE
      ══════════════════════════════════════════════════ */}
      {queue.length > 0 && (
        <section className="sb-panel" style={{ marginBottom: 20, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0 }}>📋 {c(COPY.queueTitle, l)}</h2>
              {pendingCount > 0 && <span className="sb-chip sb-chip--gold">{pendingCount}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {queue.some(q => q.status === 'done') && (
                <button
                  className="sb-button-secondary"
                  style={{ fontSize: 12, padding: '4px 12px', border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer' }}
                  onClick={clearDone}
                >
                  {c(COPY.queueClear, l)}
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  className="sb-button-primary"
                  style={{ fontSize: 12, padding: '4px 14px', border: 'none', cursor: queueBusy ? 'wait' : 'pointer', opacity: queueBusy ? .6 : 1 }}
                  disabled={queueBusy}
                  onClick={importAllPending}
                >
                  ⚡ {c(COPY.queueImportAll, l)}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            {queue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  border: `1px solid ${item.status === 'error' ? 'rgba(255,77,77,.25)' : item.status === 'done' ? 'rgba(26,240,255,.18)' : 'rgba(255,255,255,.09)'}`,
                  borderRadius: 14, padding: '10px 14px',
                  background: item.status === 'error' ? 'rgba(255,77,77,.05)' : item.status === 'done' ? 'rgba(26,240,255,.04)' : 'rgba(255,255,255,.03)',
                  transition: 'all .2s',
                }}
              >
                {/* status dot */}
                <span style={{ fontSize: 16, color: statusColor(item.status), minWidth: 20, textAlign: 'center', fontWeight: 700 }}>
                  {statusDot(item.status)}
                </span>

                {/* file type badge */}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                  background: item.ext === 'csv' ? 'rgba(255,195,0,.15)' : 'rgba(26,240,255,.12)',
                  color: item.ext === 'csv' ? '#ffc300' : '#1af0ff',
                  border: `1px solid ${item.ext === 'csv' ? 'rgba(255,195,0,.3)' : 'rgba(26,240,255,.25)'}`,
                  textTransform: 'uppercase',
                }}>
                  {item.ext}
                </span>

                {/* file name */}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>

                {/* status label */}
                <span style={{ fontSize: 12, color: statusColor(item.status), whiteSpace: 'nowrap' }}>
                  {item.status === 'pending' && c(COPY.statusPending, l)}
                  {item.status === 'importing' && c(COPY.statusImporting, l)}
                  {item.status === 'done' && `${c(COPY.statusDone, l)} · ${item.message}`}
                  {item.status === 'error' && `${c(COPY.statusError, l)}: ${item.message}`}
                </span>

                {/* per-item import button (pending only) */}
                {item.status === 'pending' && (
                  <button
                    className="sb-button-primary"
                    style={{ fontSize: 11, padding: '3px 12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => importQueueItem(item.id)}
                  >
                    Import
                  </button>
                )}

                {/* remove button */}
                {(item.status === 'pending' || item.status === 'error' || item.status === 'done') && (
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                    onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          EXISTING CONNECTORS
      ══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* CSV text connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>📄 {c(COPY.csvTitle, l)}</h2><span className="sb-caption">{c(COPY.csvHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.csvLabel, l)}</span>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} style={{ minHeight: 84 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => submit({ mode: 'csv', csvText, fileName: 'manual.csv' })}>{c(COPY.csvBtn, l)}</button>
        </section>

        {/* API connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>🔌 {c(COPY.apiTitle, l)}</h2><span className="sb-caption">{c(COPY.apiHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.apiEndpoint, l)}</span>
            <input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} />
          </label>
          <label className="sb-field"><span>{c(COPY.apiMapping, l)}</span>
            <textarea value={apiMapping} onChange={(e) => setApiMapping(e.target.value)} style={{ minHeight: 80 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runApi}>{c(COPY.apiBtn, l)}</button>
        </section>

        {/* Scraper connector */}
        <section className="sb-panel" style={{ marginBottom: 0, borderTop: 0, paddingTop: 8 }}>
          <div className="sb-panel__head"><h2>🕸️ {c(COPY.scrTitle, l)}</h2><span className="sb-caption">{c(COPY.scrHint, l)}</span></div>
          <label className="sb-field"><span>{c(COPY.scrLabel, l)}</span>
            <textarea value={scraperJson} onChange={(e) => setScraperJson(e.target.value)} style={{ minHeight: 84 }} />
          </label>
          <button className="sb-button-primary" style={{ width: '100%', border: 'none', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1 }} disabled={busy} onClick={runScraper}>{c(COPY.scrBtn, l)}</button>
        </section>
      </div>

      {/* ── imported items ── */}
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

      {/* ── source history ── */}
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
