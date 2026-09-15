// saas/lib/i18n/cosUniversityApprovalsCopy.ts
export type CosUniversityApprovalsLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosUniversityApprovalsCopy = {
  title: string
  subtitle: string
  candidate: string
  artifact: string
  noArtifact: string
  state: string
  stateNone: string
  stateArmed: string
  stateConsumed: string
  stateExpired: string
  armedAt: string
  expiresAt: string
  nextTick: string
  lastOutcome: string
  outcomeSucceeded: string
  outcomeFailed: string
  noOutcome: string
  authorize: string
  authorizing: string
  refresh: string
  waitSeconds: string
  issued: string
  signInRequired: string
}

export const COS_UNIVERSITY_APPROVALS_COPY: Record<CosUniversityApprovalsLanguage, CosUniversityApprovalsCopy> = {
  en: {
    title: 'Distilled model evaluation approval',
    subtitle: 'Authorizes exactly one bounded evaluation attempt (8 model calls, 4 judge calls, $0.20 wake ceiling, 2-hour expiry). It never authorizes production traffic.',
    candidate: 'Candidate', artifact: 'Artifact', noArtifact: 'No artifact is waiting for evaluation.',
    state: 'Approval', stateNone: 'None issued', stateArmed: 'Armed — waiting for the next evaluator run', stateConsumed: 'Used — attempt already ran', stateExpired: 'Expired unused',
    armedAt: 'Issued', expiresAt: 'Expires', nextTick: 'Next evaluator run', lastOutcome: 'Last attempt',
    outcomeSucceeded: 'Succeeded', outcomeFailed: 'Failed', noOutcome: 'No attempt result yet',
    authorize: 'Authorize one evaluation attempt', authorizing: 'Authorizing…', refresh: 'Refresh',
    waitSeconds: 'Too close to the next evaluator run. Try again in {s} seconds.', issued: 'Approval issued and confirmed in the ledger.',
    signInRequired: 'Owner sign-in required.',
  },
  es: {
    title: 'Aprobación de evaluación del modelo destilado',
    subtitle: 'Autoriza exactamente un intento de evaluación acotado (8 llamadas al modelo, 4 al juez, techo de activación de $0.20, vence en 2 horas). Nunca autoriza tráfico de producción.',
    candidate: 'Candidato', artifact: 'Artefacto', noArtifact: 'No hay ningún artefacto pendiente de evaluación.',
    state: 'Aprobación', stateNone: 'Ninguna emitida', stateArmed: 'Activa — esperando la próxima ejecución del evaluador', stateConsumed: 'Usada — el intento ya se ejecutó', stateExpired: 'Vencida sin usar',
    armedAt: 'Emitida', expiresAt: 'Vence', nextTick: 'Próxima ejecución del evaluador', lastOutcome: 'Último intento',
    outcomeSucceeded: 'Exitoso', outcomeFailed: 'Fallido', noOutcome: 'Aún no hay resultado',
    authorize: 'Autorizar un intento de evaluación', authorizing: 'Autorizando…', refresh: 'Actualizar',
    waitSeconds: 'Demasiado cerca de la próxima ejecución. Inténtalo de nuevo en {s} segundos.', issued: 'Aprobación emitida y confirmada en el registro.',
    signInRequired: 'Se requiere inicio de sesión del propietario.',
  },
  pt: {
    title: 'Aprovação de avaliação do modelo destilado',
    subtitle: 'Autoriza exatamente uma tentativa de avaliação limitada (8 chamadas ao modelo, 4 ao juiz, teto de ativação de US$0,20, expira em 2 horas). Nunca autoriza tráfego de produção.',
    candidate: 'Candidato', artifact: 'Artefato', noArtifact: 'Nenhum artefato aguardando avaliação.',
    state: 'Aprovação', stateNone: 'Nenhuma emitida', stateArmed: 'Ativa — aguardando a próxima execução do avaliador', stateConsumed: 'Usada — a tentativa já foi executada', stateExpired: 'Expirada sem uso',
    armedAt: 'Emitida', expiresAt: 'Expira', nextTick: 'Próxima execução do avaliador', lastOutcome: 'Última tentativa',
    outcomeSucceeded: 'Sucesso', outcomeFailed: 'Falhou', noOutcome: 'Ainda sem resultado',
    authorize: 'Autorizar uma tentativa de avaliação', authorizing: 'Autorizando…', refresh: 'Atualizar',
    waitSeconds: 'Muito perto da próxima execução. Tente novamente em {s} segundos.', issued: 'Aprovação emitida e confirmada no registro.',
    signInRequired: 'É necessário login do proprietário.',
  },
  pl: {
    title: 'Zatwierdzenie oceny modelu destylowanego',
    subtitle: 'Autoryzuje dokładnie jedną ograniczoną próbę oceny (8 wywołań modelu, 4 wywołania sędziego, limit wybudzenia 0,20 USD, ważność 2 godziny). Nigdy nie autoryzuje ruchu produkcyjnego.',
    candidate: 'Kandydat', artifact: 'Artefakt', noArtifact: 'Żaden artefakt nie czeka na ocenę.',
    state: 'Zatwierdzenie', stateNone: 'Nie wydano', stateArmed: 'Aktywne — czeka na następne uruchomienie oceny', stateConsumed: 'Wykorzystane — próba już się odbyła', stateExpired: 'Wygasło niewykorzystane',
    armedAt: 'Wydano', expiresAt: 'Wygasa', nextTick: 'Następne uruchomienie oceny', lastOutcome: 'Ostatnia próba',
    outcomeSucceeded: 'Udana', outcomeFailed: 'Nieudana', noOutcome: 'Brak wyniku',
    authorize: 'Autoryzuj jedną próbę oceny', authorizing: 'Autoryzowanie…', refresh: 'Odśwież',
    waitSeconds: 'Zbyt blisko następnego uruchomienia. Spróbuj ponownie za {s} s.', issued: 'Zatwierdzenie wydane i potwierdzone w rejestrze.',
    signInRequired: 'Wymagane logowanie właściciela.',
  },
  ru: {
    title: 'Одобрение оценки дистиллированной модели',
    subtitle: 'Разрешает ровно одну ограниченную попытку оценки (8 вызовов модели, 4 вызова судьи, лимит пробуждения $0,20, срок 2 часа). Никогда не разрешает продакшн-трафик.',
    candidate: 'Кандидат', artifact: 'Артефакт', noArtifact: 'Нет артефактов, ожидающих оценки.',
    state: 'Одобрение', stateNone: 'Не выдано', stateArmed: 'Активно — ожидает следующего запуска оценщика', stateConsumed: 'Использовано — попытка уже выполнена', stateExpired: 'Истекло неиспользованным',
    armedAt: 'Выдано', expiresAt: 'Истекает', nextTick: 'Следующий запуск оценщика', lastOutcome: 'Последняя попытка',
    outcomeSucceeded: 'Успешно', outcomeFailed: 'Неудачно', noOutcome: 'Результата пока нет',
    authorize: 'Разрешить одну попытку оценки', authorizing: 'Разрешение…', refresh: 'Обновить',
    waitSeconds: 'Слишком близко к следующему запуску. Повторите через {s} с.', issued: 'Одобрение выдано и подтверждено в журнале.',
    signInRequired: 'Требуется вход владельца.',
  },
}
