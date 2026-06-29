// saas/marketing-sales-core/i18n/dictionaries.ts
// Bundled five-language dictionaries — the module's source of truth. No English
// default leaks: every key exists in every language. Mirrors lib/cos i18n.
import type { Lang } from '../types'

export type MsDict = {
  department: string
  campaigns: string
  pendingApproval: string
  approve: string
  requestEdits: string
  reject: string
  archive: string
  published: string
  publishFailed: string
  willPublishTo: string
  noConnector: string
  director: string
  console: string
  errNotConnected: string
  errNotImplemented: string
  errPlatformPending: string
  errUnknown: string
}

export const DICTIONARIES: Record<Lang, MsDict> = {
  en: { department: 'Marketing & Sales', campaigns: 'Campaigns', pendingApproval: 'Pending approval', approve: 'Approve', requestEdits: 'Request edits', reject: 'Reject', archive: 'Archive', published: 'Published', publishFailed: 'Publish failed', willPublishTo: 'Will publish to', noConnector: 'No connected channel', director: 'Department head', console: 'Executive console', errNotConnected: 'This channel is not connected yet.', errNotImplemented: 'This action is not available in this version yet.', errPlatformPending: 'This channel is awaiting platform approval.', errUnknown: 'Something went wrong. Please try again.' },
  es: { department: 'Marketing y Ventas', campaigns: 'Campañas', pendingApproval: 'Pendiente de aprobación', approve: 'Aprobar', requestEdits: 'Solicitar cambios', reject: 'Rechazar', archive: 'Archivar', published: 'Publicado', publishFailed: 'Error al publicar', willPublishTo: 'Se publicará en', noConnector: 'Sin canal conectado', director: 'Jefe de departamento', console: 'Consola ejecutiva', errNotConnected: 'Este canal aún no está conectado.', errNotImplemented: 'Esta acción aún no está disponible en esta versión.', errPlatformPending: 'Este canal está pendiente de aprobación de la plataforma.', errUnknown: 'Algo salió mal. Inténtalo de nuevo.' },
  pt: { department: 'Marketing e Vendas', campaigns: 'Campanhas', pendingApproval: 'Aguardando aprovação', approve: 'Aprovar', requestEdits: 'Solicitar edições', reject: 'Rejeitar', archive: 'Arquivar', published: 'Publicado', publishFailed: 'Falha na publicação', willPublishTo: 'Será publicado em', noConnector: 'Nenhum canal conectado', director: 'Chefe de departamento', console: 'Console executivo', errNotConnected: 'Este canal ainda não está conectado.', errNotImplemented: 'Esta ação ainda não está disponível nesta versão.', errPlatformPending: 'Este canal aguarda aprovação da plataforma.', errUnknown: 'Algo deu errado. Tente novamente.' },
  pl: { department: 'Marketing i Sprzedaż', campaigns: 'Kampanie', pendingApproval: 'Oczekuje na zatwierdzenie', approve: 'Zatwierdź', requestEdits: 'Poproś o zmiany', reject: 'Odrzuć', archive: 'Archiwizuj', published: 'Opublikowano', publishFailed: 'Publikacja nie powiodła się', willPublishTo: 'Zostanie opublikowane w', noConnector: 'Brak podłączonego kanału', director: 'Szef działu', console: 'Konsola wykonawcza', errNotConnected: 'Ten kanał nie jest jeszcze połączony.', errNotImplemented: 'Ta akcja nie jest jeszcze dostępna w tej wersji.', errPlatformPending: 'Ten kanał oczekuje na zatwierdzenie platformy.', errUnknown: 'Coś poszło nie tak. Spróbuj ponownie.' },
  ru: { department: 'Маркетинг и продажи', campaigns: 'Кампании', pendingApproval: 'Ожидает одобрения', approve: 'Одобрить', requestEdits: 'Запросить правки', reject: 'Отклонить', archive: 'В архив', published: 'Опубликовано', publishFailed: 'Ошибка публикации', willPublishTo: 'Будет опубликовано в', noConnector: 'Нет подключённого канала', director: 'Руководитель отдела', console: 'Консоль руководителя', errNotConnected: 'Этот канал ещё не подключён.', errNotImplemented: 'Это действие пока недоступно в этой версии.', errPlatformPending: 'Этот канал ожидает одобрения платформы.', errUnknown: 'Что-то пошло не так. Повторите попытку.' },
}
