export const HARDCODED_UI_COPY: Record<string, Record<string, string>> = {
  es: {
    'Loading...': 'Cargando...', 'Loading…': 'Cargando…', 'Refresh': 'Actualizar', 'Open report': 'Abrir informe',
    'Audit Center': 'Centro de auditoría', 'Cybersecurity Center': 'Centro de ciberseguridad',
    'Final video review': 'Revisión final del video', 'Action result': 'Resultado de la acción', 'Recent video campaigns': 'Campañas de video recientes',
    'No recent video campaigns found.': 'No se encontraron campañas de video recientes.', 'Generate': 'Generar', 'Preview': 'Vista previa', 'Approve': 'Aprobar', 'Reject': 'Rechazar',
    'Campaign': 'Campaña', 'Campaigns': 'Campañas', 'Status': 'Estado', 'Language': 'Idioma', 'Platform': 'Plataforma', 'Objective': 'Objetivo', 'Audience': 'Audiencia',
    'Channel': 'Canal', 'Message': 'Mensaje', 'Result': 'Resultado', 'Recipient': 'Destinatario', 'Subject': 'Asunto', 'Send': 'Enviar', 'Save': 'Guardar',
    'Cancel': 'Cancelar', 'Delete': 'Eliminar', 'Search': 'Buscar', 'No items found.': 'No se encontraron elementos.', 'No data yet.': 'Aún no hay datos.',
    'Could not load': 'No se pudo cargar', 'Something went wrong': 'Algo salió mal'
  },
  pt: {
    'Loading...': 'Carregando...', 'Loading…': 'Carregando…', 'Refresh': 'Atualizar', 'Open report': 'Abrir relatório',
    'Audit Center': 'Centro de auditoria', 'Cybersecurity Center': 'Centro de cibersegurança',
    'Final video review': 'Revisão final do vídeo', 'Action result': 'Resultado da ação', 'Recent video campaigns': 'Campanhas de vídeo recentes',
    'No recent video campaigns found.': 'Nenhuma campanha de vídeo recente encontrada.', 'Generate': 'Gerar', 'Preview': 'Prévia', 'Approve': 'Aprovar', 'Reject': 'Rejeitar',
    'Campaign': 'Campanha', 'Campaigns': 'Campanhas', 'Status': 'Status', 'Language': 'Idioma', 'Platform': 'Plataforma', 'Objective': 'Objetivo', 'Audience': 'Público',
    'Channel': 'Canal', 'Message': 'Mensagem', 'Result': 'Resultado', 'Recipient': 'Destinatário', 'Subject': 'Assunto', 'Send': 'Enviar', 'Save': 'Salvar',
    'Cancel': 'Cancelar', 'Delete': 'Excluir', 'Search': 'Buscar', 'No items found.': 'Nenhum item encontrado.', 'No data yet.': 'Ainda não há dados.',
    'Could not load': 'Não foi possível carregar', 'Something went wrong': 'Algo deu errado'
  },
  pl: {
    'Loading...': 'Ładowanie...', 'Loading…': 'Ładowanie…', 'Refresh': 'Odśwież', 'Open report': 'Otwórz raport',
    'Audit Center': 'Centrum audytu', 'Cybersecurity Center': 'Centrum cyberbezpieczeństwa',
    'Final video review': 'Końcowa weryfikacja wideo', 'Action result': 'Wynik działania', 'Recent video campaigns': 'Ostatnie kampanie wideo',
    'No recent video campaigns found.': 'Nie znaleziono ostatnich kampanii wideo.', 'Generate': 'Generuj', 'Preview': 'Podgląd', 'Approve': 'Zatwierdź', 'Reject': 'Odrzuć',
    'Campaign': 'Kampania', 'Campaigns': 'Kampanie', 'Status': 'Status', 'Language': 'Język', 'Platform': 'Platforma', 'Objective': 'Cel', 'Audience': 'Odbiorcy',
    'Channel': 'Kanał', 'Message': 'Wiadomość', 'Result': 'Wynik', 'Recipient': 'Odbiorca', 'Subject': 'Temat', 'Send': 'Wyślij', 'Save': 'Zapisz',
    'Cancel': 'Anuluj', 'Delete': 'Usuń', 'Search': 'Szukaj', 'No items found.': 'Nie znaleziono elementów.', 'No data yet.': 'Brak danych.',
    'Could not load': 'Nie udało się załadować', 'Something went wrong': 'Coś poszło nie tak'
  },
  ru: {
    'Loading...': 'Загрузка...', 'Loading…': 'Загрузка…', 'Refresh': 'Обновить', 'Open report': 'Открыть отчёт',
    'Audit Center': 'Центр аудита', 'Cybersecurity Center': 'Центр кибербезопасности',
    'Final video review': 'Финальная проверка видео', 'Action result': 'Результат действия', 'Recent video campaigns': 'Последние видеокампании',
    'No recent video campaigns found.': 'Последние видеокампании не найдены.', 'Generate': 'Создать', 'Preview': 'Предпросмотр', 'Approve': 'Утвердить', 'Reject': 'Отклонить',
    'Campaign': 'Кампания', 'Campaigns': 'Кампании', 'Status': 'Статус', 'Language': 'Язык', 'Platform': 'Платформа', 'Objective': 'Цель', 'Audience': 'Аудитория',
    'Channel': 'Канал', 'Message': 'Сообщение', 'Result': 'Результат', 'Recipient': 'Получатель', 'Subject': 'Тема', 'Send': 'Отправить', 'Save': 'Сохранить',
    'Cancel': 'Отмена', 'Delete': 'Удалить', 'Search': 'Поиск', 'No items found.': 'Элементы не найдены.', 'No data yet.': 'Данных пока нет.',
    'Could not load': 'Не удалось загрузить', 'Something went wrong': 'Что-то пошло не так'
  }
}

export function applyHardcodedUiCopy(value: string, lang: string) {
  const table = HARDCODED_UI_COPY[lang]
  if (!table) return value
  const trimmed = value.trim()
  if (!trimmed) return value
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  if (table[trimmed]) return `${leading}${table[trimmed]}${trailing}`
  let next = trimmed
  for (const [source, target] of Object.entries(table).sort((a, b) => b[0].length - a[0].length)) {
    if (source.length > 2 && next.includes(source)) next = next.split(source).join(target)
  }
  return next === trimmed ? value : `${leading}${next}${trailing}`
}
