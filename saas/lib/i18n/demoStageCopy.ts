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

export type DemoStageLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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
}
