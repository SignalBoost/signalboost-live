// saas/lib/i18n/cosUniversityApprovalsCopy.ts
export type CosUniversityApprovalsLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
  de: {
    title: 'Genehmigung der Bewertung des destillierten Modells',
    subtitle: 'Autorisiert einen begrenzten Bewertungsversuch. Die Limits werden aus dem fixierten Holdout-Satz berechnet und umfassen höchstens zwei Marker-Wiederherstellungsaufrufe, eine Aufweck-Obergrenze von $0.20 und einen Ablauf nach 2 Stunden. Produktionsverkehr wird niemals autorisiert.',
    candidate: 'Kandidat', artifact: 'Artefakt', holdoutCases: 'Fixierte Holdout-Fälle', callCeilings: 'Maximale Modell-/Bewerter-/Wiederholungsaufrufe', noArtifact: 'Kein Artefakt wartet auf eine Bewertung.',
    state: 'Genehmigung', stateNone: 'Keine ausgestellt', stateArmed: 'Scharf — wartet auf den nächsten Bewertungslauf', stateConsumed: 'Verwendet — Versuch bereits ausgeführt', stateExpired: 'Ungenutzt abgelaufen', stateEvaluated: 'Bewertet — dieses Artefakt hat bereits sein unabhängiges Urteil', evaluationScores: 'Unabhängiges Urteil: Schüler {student} vs. Basis {baseline}', alreadyEvaluated: 'Dieses Artefakt hat bereits ein unabhängiges Urteil. Ein weiterer Versuch kann das Modell nicht ändern.',
    armedAt: 'Ausgestellt', expiresAt: 'Läuft ab', nextTick: 'Nächster Bewertungslauf', lastOutcome: 'Letzter Versuch',
    outcomeSucceeded: 'Erfolgreich', outcomeFailed: 'Fehlgeschlagen', noOutcome: 'Noch kein Versuchsergebnis',
    authorize: 'Einen Bewertungsversuch autorisieren', authorizing: 'Wird autorisiert…', refresh: 'Aktualisieren',
    waitSeconds: 'Zu nah am nächsten Bewertungslauf. Versuchen Sie es in {s} Sekunden erneut.', issued: 'Genehmigung ausgestellt und im Ledger bestätigt.',
    signInRequired: 'Anmeldung des Eigentümers erforderlich.',
  },
  fr: {
    title: 'Approbation de l’évaluation du modèle distillé',
    subtitle: 'Autorise une tentative d’évaluation encadrée. Les limites sont calculées à partir du jeu de test figé et incluent au plus deux appels de récupération de marqueurs, un plafond de réveil de $0.20 et une expiration de 2 heures. N’autorise jamais de trafic de production.',
    candidate: 'Candidat', artifact: 'Artefact', holdoutCases: 'Cas de test réservés épinglés', callCeilings: 'Nombre maximal d’appels modèle / juge / nouvelle tentative', noArtifact: 'Aucun artefact n’attend d’évaluation.',
    state: 'Approbation', stateNone: 'Aucune émise', stateArmed: 'Armée — en attente de la prochaine exécution de l’évaluateur', stateConsumed: 'Utilisée — tentative déjà exécutée', stateExpired: 'Expirée sans être utilisée', stateEvaluated: 'Évalué — cet artefact a déjà son verdict indépendant', evaluationScores: 'Verdict indépendant : étudiant {student} contre référence {baseline}', alreadyEvaluated: 'Cet artefact a déjà un verdict indépendant. Une autre tentative ne peut pas modifier le modèle.',
    armedAt: 'Émise', expiresAt: 'Expire', nextTick: 'Prochaine exécution de l’évaluateur', lastOutcome: 'Dernière tentative',
    outcomeSucceeded: 'Réussi', outcomeFailed: 'Échec', noOutcome: 'Aucun résultat de tentative pour l’instant',
    authorize: 'Autoriser une tentative d’évaluation', authorizing: 'Autorisation…', refresh: 'Actualiser',
    waitSeconds: 'Trop proche de la prochaine exécution de l’évaluateur. Réessayez dans {s} secondes.', issued: 'Approbation émise et confirmée dans le registre.',
    signInRequired: 'Connexion du propriétaire requise.',
  },
  it: {
    title: 'Approvazione della valutazione del modello distillato',
    subtitle: 'Autorizza un tentativo di valutazione limitato. I limiti sono calcolati dal set di holdout fissato e includono al massimo due chiamate di recupero dei marker, un tetto di riattivazione di $0.20 e una scadenza di 2 ore. Non autorizza mai traffico di produzione.',
    candidate: 'Candidato', artifact: 'Artefatto', holdoutCases: 'Casi di holdout fissati', callCeilings: 'Numero massimo di chiamate modello / giudice / nuovo tentativo', noArtifact: 'Nessun artefatto in attesa di valutazione.',
    state: 'Approvazione', stateNone: 'Nessuna emessa', stateArmed: 'Attiva — in attesa della prossima esecuzione del valutatore', stateConsumed: 'Usata — il tentativo è già stato eseguito', stateExpired: 'Scaduta senza essere usata', stateEvaluated: 'Valutato — questo artefatto ha già il suo verdetto indipendente', evaluationScores: 'Verdetto indipendente: studente {student} vs riferimento {baseline}', alreadyEvaluated: 'Questo artefatto ha già un verdetto indipendente. Un altro tentativo non può cambiare il modello.',
    armedAt: 'Emessa', expiresAt: 'Scade', nextTick: 'Prossima esecuzione del valutatore', lastOutcome: 'Ultimo tentativo',
    outcomeSucceeded: 'Riuscito', outcomeFailed: 'Non riuscito', noOutcome: 'Ancora nessun risultato',
    authorize: 'Autorizza un tentativo di valutazione', authorizing: 'Autorizzazione…', refresh: 'Aggiorna',
    waitSeconds: 'Troppo vicino alla prossima esecuzione del valutatore. Riprova tra {s} secondi.', issued: 'Approvazione emessa e confermata nel registro.',
    signInRequired: 'È richiesto l’accesso del proprietario.',
  },
  ja: {
    title: '蒸留モデル評価の承認',
    subtitle: '上限付きの評価試行を 1 回だけ承認します。上限は固定されたホールドアウトセットから算出され、マーカー復旧呼び出しは最大 2 回、起動コストの上限は $0.20、有効期限は 2 時間です。本番トラフィックは一切承認しません。',
    candidate: '候補', artifact: 'アーティファクト', holdoutCases: '固定されたホールドアウトケース', callCeilings: 'モデル／審査／再試行の最大呼び出し数', noArtifact: '評価待ちのアーティファクトはありません。',
    state: '承認', stateNone: '未発行', stateArmed: '有効 — 次回の評価実行を待機中', stateConsumed: '使用済み — 試行は実行済みです', stateExpired: '未使用のまま期限切れ', stateEvaluated: '評価済み — このアーティファクトには独立した判定がすでにあります', evaluationScores: '独立判定：生徒 {student} 対 ベースライン {baseline}', alreadyEvaluated: 'このアーティファクトには独立した判定がすでにあります。再試行してもモデルは変わりません。',
    armedAt: '発行日時', expiresAt: '有効期限', nextTick: '次回の評価実行', lastOutcome: '前回の試行',
    outcomeSucceeded: '成功', outcomeFailed: '失敗', noOutcome: '試行結果はまだありません',
    authorize: '評価を1回承認', authorizing: '承認中…', refresh: '更新',
    waitSeconds: '次回の評価実行が近すぎます。{s} 秒後にもう一度お試しください。', issued: '承認が発行され、台帳で確認されました。',
    signInRequired: 'オーナーのサインインが必要です。',
  },
  ko: {
    title: '증류 모델 평가 승인',
    subtitle: '제한된 평가 시도 1회를 승인합니다. 한도는 고정된 홀드아웃 세트에서 계산되며 마커 복구 호출 최대 2회, 기동 비용 상한 $0.20, 2시간 만료를 포함합니다. 프로덕션 트래픽은 절대 승인하지 않습니다.',
    candidate: '후보', artifact: '아티팩트', holdoutCases: '고정된 홀드아웃 케이스', callCeilings: '모델 / 심사 / 재시도 최대 호출 수', noArtifact: '평가를 기다리는 아티팩트가 없습니다.',
    state: '승인', stateNone: '발급된 항목 없음', stateArmed: '활성 — 다음 평가 실행 대기 중', stateConsumed: '사용됨 — 시도가 이미 실행되었습니다', stateExpired: '미사용 만료', stateEvaluated: '평가됨 — 이 아티팩트에는 이미 독립 판정이 있습니다', evaluationScores: '독립 판정: 학생 {student} 대 기준선 {baseline}', alreadyEvaluated: '이 아티팩트에는 이미 독립 판정이 있습니다. 다시 시도해도 모델은 바뀌지 않습니다.',
    armedAt: '발급됨', expiresAt: '만료', nextTick: '다음 평가 실행', lastOutcome: '마지막 시도',
    outcomeSucceeded: '성공', outcomeFailed: '실패', noOutcome: '아직 시도 결과가 없습니다',
    authorize: '평가 시도 1회 승인', authorizing: '승인 중…', refresh: '새로 고침',
    waitSeconds: '다음 평가 실행이 너무 가깝습니다. {s}초 후에 다시 시도하세요.', issued: '승인이 발급되어 원장에서 확인되었습니다.',
    signInRequired: '소유자 로그인이 필요합니다.',
  },
  ar: {
    title: 'الموافقة على تقييم النموذج المُقطَّر',
    subtitle: 'يأذن بمحاولة تقييم واحدة محدودة. تُحسب الحدود من مجموعة الاختبار المثبّتة، وتشمل استدعاءين على الأكثر لاستعادة العلامات، وسقف تنشيط قدره $0.20، وانتهاء صلاحية بعد ساعتين. لا يأذن أبدًا بحركة مرور الإنتاج.',
    candidate: 'المرشح', artifact: 'الأداة', holdoutCases: 'حالات الاختبار المحجوزة المثبتة', callCeilings: 'الحد الأقصى لاستدعاءات النموذج / المُحكّم / إعادة المحاولة', noArtifact: 'لا توجد أداة بانتظار التقييم.',
    state: 'الموافقة', stateNone: 'لم تُصدر أي موافقة', stateArmed: 'مفعّلة — بانتظار التشغيل التالي للمُقيّم', stateConsumed: 'مستخدمة — تم تنفيذ المحاولة بالفعل', stateExpired: 'انتهت صلاحيتها دون استخدام', stateEvaluated: 'تم التقييم — لهذه الأداة حكم مستقل بالفعل', evaluationScores: 'الحكم المستقل: الطالب {student} مقابل خط الأساس {baseline}', alreadyEvaluated: 'لهذه الأداة حكم مستقل بالفعل. لا يمكن لمحاولة أخرى تغيير النموذج.',
    armedAt: 'صدرت', expiresAt: 'تنتهي الصلاحية', nextTick: 'التشغيل التالي للمُقيّم', lastOutcome: 'المحاولة الأخيرة',
    outcomeSucceeded: 'نجحت', outcomeFailed: 'فشل', noOutcome: 'لا توجد نتيجة للمحاولة بعد',
    authorize: 'تفويض محاولة تقييم واحدة', authorizing: 'جارٍ التفويض…', refresh: 'تحديث',
    waitSeconds: 'الموعد قريب جدًا من التشغيل التالي للمُقيّم. حاول مرة أخرى بعد {s} ثانية.', issued: 'تم إصدار الموافقة وتأكيدها في السجل.',
    signInRequired: 'يلزم تسجيل دخول المالك.',
  },
}
