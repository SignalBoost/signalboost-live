export const operationsDashboardStateCopy = {
  en: { loading: 'Loading operations intelligence…', missingId: 'An organizationId query parameter is required.', unavailable: 'Unable to load operations intelligence.', empty: 'No operations snapshot is available.' },
  es: { loading: 'Cargando inteligencia de operaciones…', missingId: 'Se requiere el parámetro organizationId.', unavailable: 'No se pudo cargar la inteligencia de operaciones.', empty: 'No hay una instantánea de operaciones disponible.' },
  pt: { loading: 'Carregando inteligência de operações…', missingId: 'O parâmetro organizationId é obrigatório.', unavailable: 'Não foi possível carregar a inteligência de operações.', empty: 'Nenhum retrato de operações está disponível.' },
  pl: { loading: 'Ładowanie inteligencji operacyjnej…', missingId: 'Wymagany jest parametr organizationId.', unavailable: 'Nie udało się załadować inteligencji operacyjnej.', empty: 'Brak dostępnej migawki operacyjnej.' },
  ru: { loading: 'Загрузка операционной аналитики…', missingId: 'Требуется параметр organizationId.', unavailable: 'Не удалось загрузить операционную аналитику.', empty: 'Снимок операционных данных недоступен.' },
  de: { loading: 'Operations Intelligence wird geladen…', missingId: 'Ein organizationId-Abfrageparameter ist erforderlich.', unavailable: 'Operations Intelligence konnte nicht geladen werden.', empty: 'Kein Betriebs-Snapshot verfügbar.' },
  fr: { loading: 'Chargement de l’intelligence opérationnelle…', missingId: 'Un paramètre de requête organizationId est requis.', unavailable: 'Impossible de charger l’intelligence opérationnelle.', empty: 'Aucun instantané des opérations n’est disponible.' },
  it: { loading: 'Caricamento dell’intelligence operativa…', missingId: 'È richiesto un parametro di query organizationId.', unavailable: 'Impossibile caricare l’intelligence operativa.', empty: 'Nessuno snapshot operativo disponibile.' },
  ja: { loading: 'オペレーションインテリジェンスを読み込み中…', missingId: 'organizationIdクエリパラメーターが必要です。', unavailable: 'オペレーションインテリジェンスを読み込めませんでした。', empty: '利用可能な運用スナップショットがありません。' },
  ko: { loading: '운영 인텔리전스를 불러오는 중…', missingId: 'organizationId 쿼리 매개변수가 필요합니다.', unavailable: '운영 인텔리전스를 불러올 수 없습니다.', empty: '사용 가능한 운영 스냅샷이 없습니다.' },
  ar: { loading: 'جارٍ تحميل ذكاء العمليات…', missingId: 'معامل الاستعلام organizationId مطلوب.', unavailable: 'تعذّر تحميل ذكاء العمليات.', empty: 'لا تتوفر لقطة للعمليات.' },
} as const

export function getOperationsDashboardStateCopy(locale: string) {
  return operationsDashboardStateCopy[(locale in operationsDashboardStateCopy ? locale : 'en') as keyof typeof operationsDashboardStateCopy]
}
