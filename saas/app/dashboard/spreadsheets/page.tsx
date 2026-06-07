'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Item = {
  id: string
  name: string
  description?: string
  source_url?: string
  image_url?: string
}

type HistoryPayload = {
  groupedItems: Record<string, Item[]>
  sources: Array<{
    id: string
    type: string
    config: Record<string, unknown>
    created_at: string
  }>
}

type SpreadsheetCopy = {
  eyebrow: string
  title: string
  subtitle: string
  importData: string
  searchPlaceholder: string
  rows: string
  sources: string
  loadError: string
  genericLoadError: string
  loading: string
  empty: string
  importFirst: string
  tableName: string
  tableCategory: string
  tableDescription: string
  tableSource: string
  sourceLink: string
}

const COPY: Record<string, SpreadsheetCopy> = {
  en: {
    eyebrow: 'Spreadsheets',
    title: 'Your imported data, in one grid.',
    subtitle: 'Every item pulled in through your data connectors — searchable and grouped by category.',
    importData: '+ Import data',
    searchPlaceholder: 'Search items, categories, descriptions…',
    rows: 'rows',
    sources: 'sources',
    loadError: 'Could not load your data.',
    genericLoadError: 'Something went wrong loading your data.',
    loading: 'Loading data…',
    empty: 'No data yet.',
    importFirst: 'Import your first dataset',
    tableName: 'Name',
    tableCategory: 'Category',
    tableDescription: 'Description',
    tableSource: 'Source',
    sourceLink: 'link',
  },
  pt: {
    eyebrow: 'Planilhas',
    title: 'Seus dados importados em uma única grade.',
    subtitle: 'Todos os itens trazidos pelos conectores de dados — pesquisáveis e agrupados por categoria.',
    importData: '+ Importar dados',
    searchPlaceholder: 'Pesquisar itens, categorias, descrições…',
    rows: 'linhas',
    sources: 'fontes',
    loadError: 'Não foi possível carregar seus dados.',
    genericLoadError: 'Algo deu errado ao carregar seus dados.',
    loading: 'Carregando dados…',
    empty: 'Ainda não há dados.',
    importFirst: 'Importar seu primeiro conjunto de dados',
    tableName: 'Nome',
    tableCategory: 'Categoria',
    tableDescription: 'Descrição',
    tableSource: 'Fonte',
    sourceLink: 'link',
  },
  es: {
    eyebrow: 'Hojas de cálculo',
    title: 'Tus datos importados en una sola tabla.',
    subtitle: 'Cada elemento traído por tus conectores de datos — buscable y agrupado por categoría.',
    importData: '+ Importar datos',
    searchPlaceholder: 'Buscar elementos, categorías, descripciones…',
    rows: 'filas',
    sources: 'fuentes',
    loadError: 'No se pudieron cargar tus datos.',
    genericLoadError: 'Algo salió mal al cargar tus datos.',
    loading: 'Cargando datos…',
    empty: 'Aún no hay datos.',
    importFirst: 'Importar tu primer conjunto de datos',
    tableName: 'Nombre',
    tableCategory: 'Categoría',
    tableDescription: 'Descripción',
    tableSource: 'Fuente',
    sourceLink: 'enlace',
  },
  pl: {
    eyebrow: 'Arkusze',
    title: 'Twoje importowane dane w jednej tabeli.',
    subtitle: 'Wszystkie elementy pobrane przez konektory danych — możliwe do wyszukania i pogrupowane według kategorii.',
    importData: '+ Importuj dane',
    searchPlaceholder: 'Szukaj elementów, kategorii, opisów…',
    rows: 'wiersze',
    sources: 'źródła',
    loadError: 'Nie można załadować danych.',
    genericLoadError: 'Coś poszło nie tak podczas ładowania danych.',
    loading: 'Ładowanie danych…',
    empty: 'Brak danych.',
    importFirst: 'Zaimportuj pierwszy zestaw danych',
    tableName: 'Nazwa',
    tableCategory: 'Kategoria',
    tableDescription: 'Opis',
    tableSource: 'Źródło',
    sourceLink: 'link',
  },
  ru: {
    eyebrow: 'Таблицы',
    title: 'Ваши импортированные данные в одной таблице.',
    subtitle: 'Все элементы, полученные через коннекторы данных — доступны для поиска и сгруппированы по категориям.',
    importData: '+ Импорт данных',
    searchPlaceholder: 'Поиск элементов, категорий, описаний…',
    rows: 'строк',
    sources: 'источников',
    loadError: 'Не удалось загрузить ваши данные.',
    genericLoadError: 'Что-то пошло не так при загрузке данных.',
    loading: 'Загрузка данных…',
    empty: 'Данных пока нет.',
    importFirst: 'Импортировать первый набор данных',
    tableName: 'Название',
    tableCategory: 'Категория',
    tableDescription: 'Описание',
    tableSource: 'Источник',
    sourceLink: 'ссылка',
  },
}

function copyFor(lang: string): SpreadsheetCopy {
  return COPY[lang] || COPY.en
}

export default function SpreadsheetsPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [data, setData] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        const res = await fetch('/api/data-connectors/history', { cache: 'no-store' })
        const responseData = await res.json()

        if (!active) return

        if (!res.ok) {
          setError(responseData?.error || copy.loadError)
        }

        setData({
          groupedItems: responseData?.groupedItems || {},
          sources: Array.isArray(responseData?.sources) ? responseData.sources : [],
        })
      } catch {
        if (active) setError(copy.genericLoadError)
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [copy.genericLoadError, copy.loadError])

  const rows = useMemo(() => {
    const out: Array<{ category: string } & Item> = []

    for (const [category, items] of Object.entries(data.groupedItems || {})) {
      for (const item of items || []) {
        out.push({ category, ...item })
      }
    }

    const term = query.trim().toLowerCase()

    if (!term) return out

    return out.filter((row) =>
      [row.name, row.description, row.category, row.source_url]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [data, query])

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    position: 'sticky',
    top: 0,
    background: '#0f1117',
    borderBottom: '1px solid rgba(255,255,255,.15)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'rgba(255,255,255,.6)',
  }

  const td: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255,255,255,.06)',
    verticalAlign: 'top',
  }

  return (
    <main style={{ padding: 24, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <span className="sb-eyebrow">{copy.eyebrow}</span>

          <h1 className="sb-h2" style={{ marginTop: 10 }}>
            {copy.title}
          </h1>

          <p className="sb-body" style={{ maxWidth: 600 }}>
            {copy.subtitle}
          </p>
        </div>

        <Link className="sb-button-primary" href="/dashboard/data" style={{ alignSelf: 'flex-start' }}>
          {copy.importData}
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className="sb-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          style={{ padding: 12, flex: 1, minWidth: 220 }}
        />

        <span className="sb-caption">
          {rows.length} {copy.rows} · {data.sources.length} {copy.sources}
        </span>
      </div>

      {loading ? <p className="sb-body">{copy.loading}</p> : null}

      {error && !loading ? (
        <p className="sb-caption" style={{ color: '#fca5a5' }}>
          {error}
        </p>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="sb-body" style={{ margin: 0 }}>
            {copy.empty}
          </p>

          <div style={{ marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/data">
              {copy.importFirst}
            </Link>
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="sb-card" style={{ padding: 0, overflow: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>{copy.tableName}</th>
                <th style={th}>{copy.tableCategory}</th>
                <th style={th}>{copy.tableDescription}</th>
                <th style={th}>{copy.tableSource}</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `${row.category}-${index}`}>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.name}</td>
                  <td style={{ ...td, color: '#fde68a', whiteSpace: 'nowrap' }}>{row.category}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,.7)' }}>{row.description || '—'}</td>
                  <td style={td}>
                    {row.source_url ? (
                      <a href={row.source_url} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>
                        {copy.sourceLink}
                      </a>
                    ) : (
                      <span style={{ opacity: 0.4 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  )
}
