export type GoogleSheetsCopyLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type GoogleSheetsCopy = {
  title: string
  sub: string
  connect: string
  disconnect: string
  notConfigured: string
  connected: string
  list: string
  search: string
  range: string
  read: string
  rowSearch: string
  rowQuery: string
  noRows: string
  loading: string
}

const COPY: Record<GoogleSheetsCopyLang, GoogleSheetsCopy> = {
  en: { title: 'Google Sheets', sub: 'Connect your Google account for read-only, on-demand spreadsheet access by COS.', connect: 'Connect Google Sheets', disconnect: 'Disconnect', notConfigured: 'Google OAuth credentials are not configured on the server yet.', connected: 'Connected (read-only)', list: 'Load spreadsheets', search: 'Filter spreadsheet names', range: 'A1 range', read: 'Read range', rowSearch: 'Search rows', rowQuery: 'Search term', noRows: 'No rows returned.', loading: 'Loading…' },
  es: { title: 'Google Sheets', sub: 'Conecta tu cuenta de Google para que COS acceda a hojas de cálculo bajo demanda y en modo de solo lectura.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'Las credenciales OAuth de Google aún no están configuradas en el servidor.', connected: 'Conectado (solo lectura)', list: 'Cargar hojas', search: 'Filtrar nombres', range: 'Rango A1', read: 'Leer rango', rowSearch: 'Buscar filas', rowQuery: 'Término de búsqueda', noRows: 'No se devolvieron filas.', loading: 'Cargando…' },
  pt: { title: 'Google Sheets', sub: 'Conecte sua conta Google para acesso sob demanda e somente leitura pelo COS.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'As credenciais OAuth do Google ainda não estão configuradas no servidor.', connected: 'Conectado (somente leitura)', list: 'Carregar planilhas', search: 'Filtrar nomes', range: 'Intervalo A1', read: 'Ler intervalo', rowSearch: 'Pesquisar linhas', rowQuery: 'Termo de pesquisa', noRows: 'Nenhuma linha retornada.', loading: 'Carregando…' },
  pl: { title: 'Google Sheets', sub: 'Połącz konto Google, aby COS miał dostęp do arkuszy na żądanie w trybie tylko do odczytu.', connect: 'Połącz Google Sheets', disconnect: 'Rozłącz', notConfigured: 'Dane OAuth Google nie są jeszcze skonfigurowane na serwerze.', connected: 'Połączono (tylko odczyt)', list: 'Wczytaj arkusze', search: 'Filtruj nazwy', range: 'Zakres A1', read: 'Odczytaj zakres', rowSearch: 'Szukaj wierszy', rowQuery: 'Szukany tekst', noRows: 'Brak zwróconych wierszy.', loading: 'Ładowanie…' },
  ru: { title: 'Google Sheets', sub: 'Подключите аккаунт Google для доступа COS к таблицам по запросу только для чтения.', connect: 'Подключить Google Sheets', disconnect: 'Отключить', notConfigured: 'OAuth-данные Google пока не настроены на сервере.', connected: 'Подключено (только чтение)', list: 'Загрузить таблицы', search: 'Фильтр по названию', range: 'Диапазон A1', read: 'Прочитать диапазон', rowSearch: 'Поиск строк', rowQuery: 'Поисковый запрос', noRows: 'Строки не найдены.', loading: 'Загрузка…' },
}

export function googleSheetsCopy(lang: string): GoogleSheetsCopy {
  const key = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as GoogleSheetsCopyLang
  return COPY[key]
}
