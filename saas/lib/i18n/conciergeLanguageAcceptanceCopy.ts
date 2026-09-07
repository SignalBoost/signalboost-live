type Copy = {
  title:string; subtitle:string; run:string; running:string; refresh:string; automated:string; native:string; full:string; cases:string;
  pass:string; fail:string; pending:string; source:string; latency:string; milliseconds:string; responses:string; nativeReview:string;
  reviewPass:string; reviewFail:string; reviewNote:string; notePlaceholder:string; noRuns:string; automatedNote:string; nativeNote:string;
}

const COPY:Record<string,Copy> = {
  en: {
    title:'Concierge language acceptance', subtitle:'Run the 25-case Production-style matrix for English, Spanish, Brazilian Portuguese, Polish, and Russian. Automated checks do not self-certify native fluency.',
    run:'Run 25-case matrix', running:'Running matrix…', refresh:'Refresh', automated:'Automated gate', native:'Native review', full:'Full acceptance', cases:'Cases', pass:'PASS', fail:'FAIL', pending:'Pending', source:'Source', latency:'Latency', milliseconds:'ms', responses:'Case evidence', nativeReview:'Human native-language review', reviewPass:'Native pass', reviewFail:'Native fail', reviewNote:'Review note', notePlaceholder:'Optional note from the fluent/native reviewer', noRuns:'No language acceptance run has been recorded yet.', automatedNote:'Automation checks selected language, English leakage, critical-token preservation, routing, and latency.', nativeNote:'Native grammar, idiom, register, and naturalness require fluent human judgment; Polish is the priority motivating review.'
  },
  es: {
    title:'Aceptación de idiomas de Concierge', subtitle:'Ejecuta la matriz de 25 casos para inglés, español, portugués de Brasil, polaco y ruso. Las comprobaciones automáticas no certifican por sí solas la fluidez nativa.',
    run:'Ejecutar matriz de 25 casos', running:'Ejecutando matriz…', refresh:'Actualizar', automated:'Control automático', native:'Revisión nativa', full:'Aceptación completa', cases:'Casos', pass:'APROBADO', fail:'FALLÓ', pending:'Pendiente', source:'Fuente', latency:'Latencia', milliseconds:'ms', responses:'Evidencia por caso', nativeReview:'Revisión humana del idioma', reviewPass:'Aprobar como nativo', reviewFail:'Rechazar como nativo', reviewNote:'Nota de revisión', notePlaceholder:'Nota opcional de la persona revisora', noRuns:'Aún no hay ninguna ejecución de aceptación de idiomas.', automatedNote:'La automatización comprueba idioma seleccionado, fugas de inglés, conservación de tokens críticos, enrutamiento y latencia.', nativeNote:'La gramática, el registro, los modismos y la naturalidad requieren juicio humano fluido; el polaco es la revisión prioritaria.'
  },
  pt: {
    title:'Aceitação de idiomas do Concierge', subtitle:'Execute a matriz de 25 casos para inglês, espanhol, português brasileiro, polonês e russo. As verificações automáticas não certificam fluência nativa sozinhas.',
    run:'Executar matriz de 25 casos', running:'Executando matriz…', refresh:'Atualizar', automated:'Gate automatizado', native:'Revisão nativa', full:'Aceitação completa', cases:'Casos', pass:'APROVADO', fail:'FALHOU', pending:'Pendente', source:'Origem', latency:'Latência', milliseconds:'ms', responses:'Evidência por caso', nativeReview:'Revisão humana do idioma', reviewPass:'Aprovar como nativo', reviewFail:'Reprovar como nativo', reviewNote:'Nota da revisão', notePlaceholder:'Nota opcional do revisor fluente/nativo', noRuns:'Ainda não há execução de aceitação de idiomas registrada.', automatedNote:'A automação verifica idioma selecionado, vazamento de inglês, preservação de tokens críticos, roteamento e latência.', nativeNote:'Gramática, expressões idiomáticas, registro e naturalidade exigem avaliação humana fluente; o polonês é a prioridade.'
  },
  pl: {
    title:'Akceptacja jakości językowej Concierge', subtitle:'Uruchom macierz 25 przypadków dla angielskiego, hiszpańskiego, brazylijskiego portugalskiego, polskiego i rosyjskiego. Automatyczne testy nie mogą same potwierdzić jakości rodzimego użytkownika języka.',
    run:'Uruchom 25 przypadków', running:'Trwa wykonywanie…', refresh:'Odśwież', automated:'Brama automatyczna', native:'Ocena native speakera', full:'Pełna akceptacja', cases:'Przypadki', pass:'ZALICZONE', fail:'NIEZALICZONE', pending:'Oczekuje', source:'Źródło', latency:'Opóźnienie', milliseconds:'ms', responses:'Dowody z przypadków', nativeReview:'Ocena osoby biegle posługującej się językiem', reviewPass:'Język naturalny — zalicz', reviewFail:'Język nienaturalny — odrzuć', reviewNote:'Uwagi z oceny', notePlaceholder:'Opcjonalna uwaga osoby oceniającej język', noRuns:'Nie zapisano jeszcze żadnego przebiegu akceptacji językowej.', automatedNote:'Automatyka sprawdza wybrany język, przecieki angielskiego, zachowanie krytycznych tokenów, routing i opóźnienie.', nativeNote:'Poprawność gramatyczna, idiomatyczność, rejestr i naturalność wymagają oceny człowieka; polski jest priorytetem tej weryfikacji.'
  },
  ru: {
    title:'Проверка языкового качества Concierge', subtitle:'Запустите матрицу из 25 случаев для английского, испанского, бразильского португальского, польского и русского. Автоматические проверки сами по себе не подтверждают уровень носителя языка.',
    run:'Запустить 25 случаев', running:'Матрица выполняется…', refresh:'Обновить', automated:'Автоматический контроль', native:'Проверка носителем', full:'Полная приёмка', cases:'Случаи', pass:'ПРОЙДЕНО', fail:'НЕ ПРОЙДЕНО', pending:'Ожидает', source:'Источник', latency:'Задержка', milliseconds:'мс', responses:'Доказательства по случаям', nativeReview:'Человеческая языковая проверка', reviewPass:'Подтвердить естественность', reviewFail:'Отклонить естественность', reviewNote:'Примечание', notePlaceholder:'Необязательное примечание проверяющего', noRuns:'Запуск языковой приёмки ещё не записан.', automatedNote:'Автоматика проверяет выбранный язык, утечки английского, сохранность критических токенов, маршрутизацию и задержку.', nativeNote:'Грамматика, идиоматика, регистр и естественность требуют оценки человека; польский — приоритетный язык этой проверки.'
  },
}

export function getConciergeLanguageAcceptanceCopy(language?:string|null):Copy {
  const code = String(language || 'en').toLowerCase().split('-')[0]
  return COPY[code] || COPY.en
}
