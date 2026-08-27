export type GoogleSheetsCopyLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type GoogleSheetsCopy = {
  title: string
  sub: string
  connect: string
  disconnect: string
  notConfigured: string
  connected: string
  connectedAccount: string
  missingPermissions: string
  list: string
  search: string
  noSpreadsheets: string
  directHelp: string
  directPlaceholder: string
  openSpreadsheet: string
  spreadsheetReady: string
  range: string
  read: string
  rowSearch: string
  rowQuery: string
  noRows: string
  loading: string
}

const COPY: Record<GoogleSheetsCopyLang, GoogleSheetsCopy> = {
  en: { title: 'Google Sheets', sub: 'Connect your Google account for read-only, on-demand spreadsheet access by COS.', connect: 'Connect Google Sheets', disconnect: 'Disconnect', notConfigured: 'Google OAuth credentials are not configured on the server yet.', connected: 'Connected (read-only)', connectedAccount: 'Connected Google account', missingPermissions: 'Google did not grant all required read-only permissions. Reconnect and approve both Google Sheets read access and Google Drive metadata access.', list: 'Load spreadsheets', search: 'Filter spreadsheet names', noSpreadsheets: 'No spreadsheets were found in this connected Google account.', directHelp: 'If a spreadsheet is not listed, paste its Google Sheets link or spreadsheet ID below.', directPlaceholder: 'Google Sheets link or spreadsheet ID', openSpreadsheet: 'Open spreadsheet', spreadsheetReady: 'Spreadsheet selected and ready to read.', range: 'A1 range', read: 'Read range', rowSearch: 'Search rows', rowQuery: 'Search term', noRows: 'No rows returned.', loading: 'Loading…' },
  es: { title: 'Google Sheets', sub: 'Conecta tu cuenta de Google para que COS acceda a hojas de cálculo bajo demanda y en modo de solo lectura.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'Las credenciales OAuth de Google aún no están configuradas en el servidor.', connected: 'Conectado (solo lectura)', connectedAccount: 'Cuenta de Google conectada', missingPermissions: 'Google no concedió todos los permisos de solo lectura necesarios. Vuelve a conectar y aprueba el acceso de lectura a Google Sheets y a los metadatos de Google Drive.', list: 'Cargar hojas', search: 'Filtrar nombres', noSpreadsheets: 'No se encontraron hojas de cálculo en esta cuenta de Google conectada.', directHelp: 'Si una hoja no aparece en la lista, pega abajo su enlace de Google Sheets o su ID.', directPlaceholder: 'Enlace de Google Sheets o ID de la hoja', openSpreadsheet: 'Abrir hoja', spreadsheetReady: 'Hoja seleccionada y lista para leer.', range: 'Rango A1', read: 'Leer rango', rowSearch: 'Buscar filas', rowQuery: 'Término de búsqueda', noRows: 'No se devolvieron filas.', loading: 'Cargando…' },
  pt: { title: 'Google Sheets', sub: 'Conecte sua conta Google para acesso sob demanda e somente leitura pelo COS.', connect: 'Conectar Google Sheets', disconnect: 'Desconectar', notConfigured: 'As credenciais OAuth do Google ainda não estão configuradas no servidor.', connected: 'Conectado (somente leitura)', connectedAccount: 'Conta Google conectada', missingPermissions: 'O Google não concedeu todas as permissões de somente leitura necessárias. Reconecte e aprove o acesso de leitura ao Google Sheets e aos metadados do Google Drive.', list: 'Carregar planilhas', search: 'Filtrar nomes', noSpreadsheets: 'Nenhuma planilha foi encontrada nesta conta Google conectada.', directHelp: 'Se uma planilha não aparecer na lista, cole abaixo o link do Google Sheets ou o ID da planilha.', directPlaceholder: 'Link do Google Sheets ou ID da planilha', openSpreadsheet: 'Abrir planilha', spreadsheetReady: 'Planilha selecionada e pronta para leitura.', range: 'Intervalo A1', read: 'Ler intervalo', rowSearch: 'Pesquisar linhas', rowQuery: 'Termo de pesquisa', noRows: 'Nenhuma linha retornada.', loading: 'Carregando…' },
  pl: { title: 'Google Sheets', sub: 'Połącz konto Google, aby COS miał dostęp do arkuszy na żądanie w trybie tylko do odczytu.', connect: 'Połącz Google Sheets', disconnect: 'Rozłącz', notConfigured: 'Dane OAuth Google nie są jeszcze skonfigurowane na serwerze.', connected: 'Połączono (tylko odczyt)', connectedAccount: 'Połączone konto Google', missingPermissions: 'Google nie przyznał wszystkich wymaganych uprawnień tylko do odczytu. Połącz konto ponownie i zatwierdź odczyt Google Sheets oraz metadanych Google Drive.', list: 'Wczytaj arkusze', search: 'Filtruj nazwy', noSpreadsheets: 'Nie znaleziono arkuszy kalkulacyjnych na tym połączonym koncie Google.', directHelp: 'Jeśli arkusza nie ma na liście, wklej poniżej link Google Sheets lub identyfikator arkusza.', directPlaceholder: 'Link Google Sheets lub identyfikator arkusza', openSpreadsheet: 'Otwórz arkusz', spreadsheetReady: 'Arkusz wybrany i gotowy do odczytu.', range: 'Zakres A1', read: 'Odczytaj zakres', rowSearch: 'Szukaj wierszy', rowQuery: 'Szukany tekst', noRows: 'Brak zwróconych wierszy.', loading: 'Ładowanie…' },
  ru: { title: 'Google Sheets', sub: 'Подключите аккаунт Google для доступа COS к таблицам по запросу только для чтения.', connect: 'Подключить Google Sheets', disconnect: 'Отключить', notConfigured: 'OAuth-данные Google пока не настроены на сервере.', connected: 'Подключено (только чтение)', connectedAccount: 'Подключенный аккаунт Google', missingPermissions: 'Google не предоставил все необходимые разрешения только для чтения. Подключитесь снова и разрешите чтение Google Sheets и метаданных Google Drive.', list: 'Загрузить таблицы', search: 'Фильтр по названию', noSpreadsheets: 'В подключенном аккаунте Google таблицы не найдены.', directHelp: 'Если таблица не отображается в списке, вставьте ниже ссылку Google Sheets или идентификатор таблицы.', directPlaceholder: 'Ссылка Google Sheets или ID таблицы', openSpreadsheet: 'Открыть таблицу', spreadsheetReady: 'Таблица выбрана и готова к чтению.', range: 'Диапазон A1', read: 'Прочитать диапазон', rowSearch: 'Поиск строк', rowQuery: 'Поисковый запрос', noRows: 'Строки не найдены.', loading: 'Загрузка…' },
}

export function googleSheetsCopy(lang: string): GoogleSheetsCopy {
  const key = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as GoogleSheetsCopyLang
  return COPY[key]
}
