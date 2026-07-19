export const operationsDashboardStateCopy = {
  en: { loading: 'Loading operations intelligence…', missingId: 'An organizationId query parameter is required.', unavailable: 'Unable to load operations intelligence.', empty: 'No operations snapshot is available.' },
  es: { loading: 'Cargando inteligencia de operaciones…', missingId: 'Se requiere el parámetro organizationId.', unavailable: 'No se pudo cargar la inteligencia de operaciones.', empty: 'No hay una instantánea de operaciones disponible.' },
  pt: { loading: 'Carregando inteligência de operações…', missingId: 'O parâmetro organizationId é obrigatório.', unavailable: 'Não foi possível carregar a inteligência de operações.', empty: 'Nenhum retrato de operações está disponível.' },
  pl: { loading: 'Ładowanie inteligencji operacyjnej…', missingId: 'Wymagany jest parametr organizationId.', unavailable: 'Nie udało się załadować inteligencji operacyjnej.', empty: 'Brak dostępnej migawki operacyjnej.' },
  ru: { loading: 'Загрузка операционной аналитики…', missingId: 'Требуется параметр organizationId.', unavailable: 'Не удалось загрузить операционную аналитику.', empty: 'Снимок операционных данных недоступен.' },
} as const

export function getOperationsDashboardStateCopy(locale: string) {
  return operationsDashboardStateCopy[(locale in operationsDashboardStateCopy ? locale : 'en') as keyof typeof operationsDashboardStateCopy]
}
