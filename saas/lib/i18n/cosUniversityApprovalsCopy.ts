// saas/lib/i18n/cosUniversityApprovalsCopy.ts
export type CosUniversityApprovalsLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosUniversityApprovalsCopy = {
  title: string
  subtitle: string
  candidate: string
  artifact: string
  holdoutCases: string
  callCeilings: string
  noArtifact: string
  state: string
  stateNone: string
  stateArmed: string
  stateConsumed: string
  stateExpired: string
  stateEvaluated: string
  evaluationScores: string
  alreadyEvaluated: string
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
    subtitle: 'Authorizes one bounded evaluation attempt. Limits are calculated from the pinned holdout and include at most two marker-recovery calls, a $0.20 wake ceiling, and a 2-hour expiry. It never authorizes production traffic.',
    candidate: 'Candidate', artifact: 'Artifact', holdoutCases: 'Pinned holdout cases', callCeilings: 'Maximum model / judge / retry calls', noArtifact: 'No artifact is waiting for evaluation.',
    state: 'Approval', stateNone: 'None issued', stateArmed: 'Armed — waiting for the next evaluator run', stateConsumed: 'Used — attempt already ran', stateExpired: 'Expired unused', stateEvaluated: 'Evaluated — this artifact already has its independent verdict', evaluationScores: 'Independent verdict: student {student} vs baseline {baseline}', alreadyEvaluated: 'This artifact already has an independent verdict. Another attempt cannot change the model.',
    armedAt: 'Issued', expiresAt: 'Expires', nextTick: 'Next evaluator run', lastOutcome: 'Last attempt',
    outcomeSucceeded: 'Succeeded', outcomeFailed: 'Failed', noOutcome: 'No attempt result yet',
    authorize: 'Authorize one evaluation attempt', authorizing: 'Authorizing…', refresh: 'Refresh',
    waitSeconds: 'Too close to the next evaluator run. Try again in {s} seconds.', issued: 'Approval issued and confirmed in the ledger.',
    signInRequired: 'Owner sign-in required.',
  },
  es: {
    title: 'Aprobación de evaluación del modelo destilado',
    subtitle: 'Autoriza un intento de evaluación acotado. Los límites se calculan a partir del conjunto de prueba fijado e incluyen como máximo dos llamadas de recuperación, un techo de activación de $0.20 y 2 horas de vigencia. Nunca autoriza tráfico de producción.',
    candidate: 'Candidato', artifact: 'Artefacto', holdoutCases: 'Casos de prueba fijados', callCeilings: 'Máximo de llamadas al modelo / juez / reintento', noArtifact: 'No hay ningún artefacto pendiente de evaluación.',
    state: 'Aprobación', stateNone: 'Ninguna emitida', stateArmed: 'Activa — esperando la próxima ejecución del evaluador', stateConsumed: 'Usada — el intento ya se ejecutó', stateExpired: 'Vencida sin usar', stateEvaluated: 'Evaluado — este artefacto ya tiene su veredicto independiente', evaluationScores: 'Veredicto independiente: estudiante {student} frente a referencia {baseline}', alreadyEvaluated: 'Este artefacto ya tiene un veredicto independiente. Otro intento no puede cambiar el modelo.',
    armedAt: 'Emitida', expiresAt: 'Vence', nextTick: 'Próxima ejecución del evaluador', lastOutcome: 'Último intento',
    outcomeSucceeded: 'Exitoso', outcomeFailed: 'Fallido', noOutcome: 'Aún no hay resultado',
    authorize: 'Autorizar un intento de evaluación', authorizing: 'Autorizando…', refresh: 'Actualizar',
    waitSeconds: 'Demasiado cerca de la próxima ejecución. Inténtalo de nuevo en {s} segundos.', issued: 'Aprobación emitida y confirmada en el registro.',
    signInRequired: 'Se requiere inicio de sesión del propietario.',
  },
  pt: {
    title: 'Aprovação de avaliação do modelo destilado',
    subtitle: 'Autoriza uma tentativa de avaliação limitada. Os limites são calculados a partir do conjunto de teste fixado e incluem no máximo duas chamadas de recuperação, teto de ativação de US$0,20 e validade de 2 horas. Nunca autoriza tráfego de produção.',
    candidate: 'Candidato', artifact: 'Artefato', holdoutCases: 'Casos de teste fixados', callCeilings: 'Máximo de chamadas ao modelo / juiz / repetição', noArtifact: 'Nenhum artefato aguardando avaliação.',
    state: 'Aprovação', stateNone: 'Nenhuma emitida', stateArmed: 'Ativa — aguardando a próxima execução do avaliador', stateConsumed: 'Usada — a tentativa já foi executada', stateExpired: 'Expirada sem uso', stateEvaluated: 'Avaliado — este artefato já tem seu veredito independente', evaluationScores: 'Veredito independente: aluno {student} vs referência {baseline}', alreadyEvaluated: 'Este artefato já tem um veredito independente. Outra tentativa não pode mudar o modelo.',
    armedAt: 'Emitida', expiresAt: 'Expira', nextTick: 'Próxima execução do avaliador', lastOutcome: 'Última tentativa',
    outcomeSucceeded: 'Sucesso', outcomeFailed: 'Falhou', noOutcome: 'Ainda sem resultado',
    authorize: 'Autorizar uma tentativa de avaliação', authorizing: 'Autorizando…', refresh: 'Atualizar',
    waitSeconds: 'Muito perto da próxima execução. Tente novamente em {s} segundos.', issued: 'Aprovação emitida e confirmada no registro.',
    signInRequired: 'É necessário login do proprietário.',
  },
  pl: {
    title: 'Zatwierdzenie oceny modelu destylowanego',
    subtitle: 'Autoryzuje jedną ograniczoną próbę oceny. Limity są obliczane z przypiętego zbioru testowego i obejmują najwyżej dwa wywołania naprawcze, limit wybudzenia 0,20 USD oraz ważność 2 godziny. Nigdy nie autoryzuje ruchu produkcyjnego.',
    candidate: 'Kandydat', artifact: 'Artefakt', holdoutCases: 'Przypięte przypadki testowe', callCeilings: 'Maks. wywołań modelu / sędziego / ponowienia', noArtifact: 'Żaden artefakt nie czeka na ocenę.',
    state: 'Zatwierdzenie', stateNone: 'Nie wydano', stateArmed: 'Aktywne — czeka na następne uruchomienie oceny', stateConsumed: 'Wykorzystane — próba już się odbyła', stateExpired: 'Wygasło niewykorzystane', stateEvaluated: 'Oceniony — ten artefakt ma już niezależny werdykt', evaluationScores: 'Niezależny werdykt: uczeń {student} vs punkt odniesienia {baseline}', alreadyEvaluated: 'Ten artefakt ma już niezależny werdykt. Kolejna próba nie zmieni modelu.',
    armedAt: 'Wydano', expiresAt: 'Wygasa', nextTick: 'Następne uruchomienie oceny', lastOutcome: 'Ostatnia próba',
    outcomeSucceeded: 'Udana', outcomeFailed: 'Nieudana', noOutcome: 'Brak wyniku',
    authorize: 'Autoryzuj jedną próbę oceny', authorizing: 'Autoryzowanie…', refresh: 'Odśwież',
    waitSeconds: 'Zbyt blisko następnego uruchomienia. Spróbuj ponownie za {s} s.', issued: 'Zatwierdzenie wydane i potwierdzone w rejestrze.',
    signInRequired: 'Wymagane logowanie właściciela.',
  },
  ru: {
    title: 'Одобрение оценки дистиллированной модели',
    subtitle: 'Разрешает одну ограниченную попытку оценки. Лимиты рассчитываются по закреплённой контрольной выборке и включают не более двух восстановительных вызовов, лимит пробуждения $0,20 и срок 2 часа. Никогда не разрешает продакшн-трафик.',
    candidate: 'Кандидат', artifact: 'Артефакт', holdoutCases: 'Закреплённые контрольные примеры', callCeilings: 'Макс. вызовов модели / судьи / повтора', noArtifact: 'Нет артефактов, ожидающих оценки.',
    state: 'Одобрение', stateNone: 'Не выдано', stateArmed: 'Активно — ожидает следующего запуска оценщика', stateConsumed: 'Использовано — попытка уже выполнена', stateExpired: 'Истекло неиспользованным', stateEvaluated: 'Оценено — у этого артефакта уже есть независимый вердикт', evaluationScores: 'Независимый вердикт: ученик {student} против базовой {baseline}', alreadyEvaluated: 'У этого артефакта уже есть независимый вердикт. Новая попытка не изменит модель.',
    armedAt: 'Выдано', expiresAt: 'Истекает', nextTick: 'Следующий запуск оценщика', lastOutcome: 'Последняя попытка',
    outcomeSucceeded: 'Успешно', outcomeFailed: 'Неудачно', noOutcome: 'Результата пока нет',
    authorize: 'Разрешить одну попытку оценки', authorizing: 'Разрешение…', refresh: 'Обновить',
    waitSeconds: 'Слишком близко к следующему запуску. Повторите через {s} с.', issued: 'Одобрение выдано и подтверждено в журнале.',
    signInRequired: 'Требуется вход владельца.',
  },
}
