// saas/lib/i18n/demoStageCopy.ts
//
// HONEST STAGE COPY FOR A READ-ONLY RUN.
//
// The demo page narrates six stages written for a full repair: detected, diagnosed, gated,
// executed, verified, audited. A Vercel observation run is not that. It detects, diagnoses,
// and then performs a READ-ONLY inspection — read the deployment, read its events, read the
// production aliases, verify the diagnosis. No consequential step exists in such a run, so
// nothing is gated and nothing is executed.
//
// Left alone, the page told a prospect that consequential steps had stopped for a human and
// that approved steps had been carried out, on a run where neither happened. Both sentences
// are true of the product and false of the record being shown, which is the worst kind of
// overclaim for a product sold on the trustworthiness of its audit trail — and it is exactly
// what a technical evaluator would catch and quote back.
//
// These strings replace stages 3 and 4 when every approved step was a read or a verification.
// They are kept in lib/ because page-copy guards forbid user-facing English inside app/.

export type DemoStageLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

export type DemoStageCopy = {
  readOnlyGated: string
  readOnlyExecuted: string
  readOnlyBadge: string
}

export const DEMO_STAGE_COPY: Record<DemoStageLanguage, DemoStageCopy> = {
  en: {
    readOnlyBadge: 'Read-only run',
    readOnlyGated: 'Nothing in this run was consequential, so nothing needed an approver. The steps below only read state. When a plan does contain a consequential step, it stops for a named human — that is shown in the rehearsal above.',
    readOnlyExecuted: 'No repair was executed. This run inspected the deployment to confirm the diagnosis; it did not change anything.',
  },
  es: {
    readOnlyBadge: 'Ejecución de solo lectura',
    readOnlyGated: 'Nada en esta ejecución fue consecuente, así que nada requirió aprobación. Los pasos siguientes solo leen estado. Cuando un plan sí contiene un paso consecuente, este se detiene ante una persona designada, como se muestra en el ensayo anterior.',
    readOnlyExecuted: 'No se ejecutó ninguna reparación. Esta ejecución inspeccionó el despliegue para confirmar el diagnóstico; no modificó nada.',
  },
  pt: {
    readOnlyBadge: 'Execução só de leitura',
    readOnlyGated: 'Nada nesta execução foi consequente, por isso nada exigiu aprovação. Os passos abaixo apenas leem estado. Quando um plano contém um passo consequente, este para perante uma pessoa designada, como se vê no ensaio acima.',
    readOnlyExecuted: 'Nenhuma reparação foi executada. Esta execução inspecionou a implantação para confirmar o diagnóstico; não alterou nada.',
  },
  pl: {
    readOnlyBadge: 'Przebieg tylko do odczytu',
    readOnlyGated: 'Nic w tym przebiegu nie miało istotnych skutków, więc nic nie wymagało zatwierdzenia. Poniższe kroki jedynie odczytują stan. Gdy plan zawiera krok o istotnych skutkach, zatrzymuje się on przed wskazaną osobą — widać to w próbie powyżej.',
    readOnlyExecuted: 'Nie wykonano żadnej naprawy. Ten przebieg zbadał wdrożenie, aby potwierdzić diagnozę; niczego nie zmienił.',
  },
  ru: {
    readOnlyBadge: 'Запуск только для чтения',
    readOnlyGated: 'В этом запуске не было значимых шагов, поэтому согласование не требовалось. Шаги ниже только читают состояние. Когда в плане есть значимый шаг, он останавливается перед назначенным человеком — это видно в репетиции выше.',
    readOnlyExecuted: 'Восстановление не выполнялось. Этот запуск изучил развёртывание, чтобы подтвердить диагноз; ничего не изменялось.',
  },
  de: {
    readOnlyBadge: 'Schreibgeschützter Lauf',
    readOnlyGated: 'Nichts in diesem Lauf hatte Auswirkungen, daher war keine Freigabe nötig. Die folgenden Schritte lesen nur den Zustand. Enthält ein Plan einen folgenreichen Schritt, hält er für eine namentlich benannte Person an – das zeigt die Probe oben.',
    readOnlyExecuted: 'Es wurde keine Reparatur ausgeführt. Dieser Lauf hat die Bereitstellung geprüft, um die Diagnose zu bestätigen; er hat nichts verändert.',
  },
  fr: {
    readOnlyBadge: 'Exécution en lecture seule',
    readOnlyGated: 'Rien dans cette exécution n’avait de conséquence, donc aucune approbation n’était requise. Les étapes ci-dessous ne font que lire l’état. Lorsqu’un plan contient une étape à conséquence, il s’arrête pour une personne désignée — comme le montre la répétition ci-dessus.',
    readOnlyExecuted: 'Aucune réparation n’a été exécutée. Cette exécution a inspecté le déploiement pour confirmer le diagnostic ; elle n’a rien modifié.',
  },
  it: {
    readOnlyBadge: 'Esecuzione in sola lettura',
    readOnlyGated: 'Nulla in questa esecuzione aveva conseguenze, quindi non serviva alcuna approvazione. I passaggi seguenti leggono solo lo stato. Quando un piano contiene un passaggio con conseguenze, si ferma per una persona designata, come mostrato nella prova qui sopra.',
    readOnlyExecuted: 'Nessuna riparazione è stata eseguita. Questa esecuzione ha ispezionato il deployment per confermare la diagnosi; non ha modificato nulla.',
  },
  ja: {
    readOnlyBadge: '読み取り専用の実行',
    readOnlyGated: 'この実行には影響のある操作がなかったため、承認者は不要でした。以下のステップは状態を読み取るだけです。影響のあるステップを含むプランは、指名された担当者の承認まで停止します。その様子は上のリハーサルで示しています。',
    readOnlyExecuted: '修復は実行されていません。この実行は診断を確認するためにデプロイを調査しただけで、何も変更していません。',
  },
  ko: {
    readOnlyBadge: '읽기 전용 실행',
    readOnlyGated: '이번 실행에는 영향을 미치는 작업이 없었으므로 승인자가 필요하지 않았습니다. 아래 단계는 상태를 읽기만 합니다. 계획에 영향을 미치는 단계가 포함되면 지정된 담당자의 승인을 위해 중지되며, 이는 위의 리허설에서 확인할 수 있습니다.',
    readOnlyExecuted: '복구는 실행되지 않았습니다. 이번 실행은 진단을 확인하기 위해 배포를 점검했을 뿐, 아무것도 변경하지 않았습니다.',
  },
  ar: {
    readOnlyBadge: 'تشغيل للقراءة فقط',
    readOnlyGated: 'لم يكن في هذا التشغيل أي إجراء ذي أثر، لذا لم يتطلب أي شيء موافقة. الخطوات أدناه تقرأ الحالة فقط. عندما تتضمن خطة خطوة ذات أثر، فإنها تتوقف بانتظار شخص محدد بالاسم، كما هو موضح في التجربة أعلاه.',
    readOnlyExecuted: 'لم يُنفَّذ أي إصلاح. فحص هذا التشغيل عملية النشر لتأكيد التشخيص، ولم يغيّر أي شيء.',
  },
}
