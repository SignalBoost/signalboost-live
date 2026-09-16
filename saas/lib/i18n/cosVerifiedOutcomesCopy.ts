export type CosVerifiedOutcomesLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type CosVerifiedOutcomesCopy = {
  title: string; subtitle: string; rules: string; empty: string; refresh: string; utc: string
  request: string; reply: string; subjects: string; noSubject: string; verified: string
  outcome: string; success: string; failure: string
  evidence: string; evidenceHint: string; summary: string; summaryHint: string
  submit: string; submitting: string; recorded: string; signInRequired: string
}

export const COS_VERIFIED_OUTCOMES_COPY: Record<CosVerifiedOutcomesLanguage, CosVerifiedOutcomesCopy> = {
  en: {
    title: 'Verify real-world outcomes of COS answers',
    subtitle: 'Record what actually happened after you used a COS answer. Verified outcomes are the Production evidence University subjects need for grade A.',
    rules: 'Record failures as honestly as successes. Each answer can be verified once, within 30 days, with a reference to the real record (document, ticket, URL, filing, message). Subjects come from your original request, not from COS’s reply.',
    empty: 'No COS answers from the last 30 days.', refresh: 'Refresh', utc: 'UTC',
    request: 'Your request', reply: 'COS answer', subjects: 'University subjects', noSubject: 'No University subject — cannot be verified', verified: 'Outcome already verified',
    outcome: 'What happened', success: 'It worked in practice', failure: 'It did not work in practice',
    evidence: 'Evidence reference', evidenceHint: 'Link or ID of the real record that proves the outcome',
    summary: 'What happened', summaryHint: 'One or two sentences describing the real result',
    submit: 'Record verified outcome', submitting: 'Recording…', recorded: 'Verified outcome recorded and confirmed.', signInRequired: 'Owner sign-in required.',
  },
  es: {
    title: 'Verificar resultados reales de las respuestas de COS',
    subtitle: 'Registra lo que ocurrió realmente después de usar una respuesta de COS. Los resultados verificados son la evidencia de producción que las materias universitarias necesitan para obtener A.',
    rules: 'Registra los fracasos con la misma honestidad que los éxitos. Cada respuesta se puede verificar una vez, dentro de 30 días, con una referencia al registro real (documento, ticket, URL, expediente, mensaje). Las materias se derivan de tu solicitud original, no de la respuesta de COS.',
    empty: 'No hay respuestas de COS de los últimos 30 días.', refresh: 'Actualizar', utc: 'UTC',
    request: 'Tu solicitud', reply: 'Respuesta de COS', subjects: 'Materias universitarias', noSubject: 'Sin materia universitaria: no se puede verificar', verified: 'Resultado ya verificado',
    outcome: 'Qué ocurrió', success: 'Funcionó en la práctica', failure: 'No funcionó en la práctica',
    evidence: 'Referencia de evidencia', evidenceHint: 'Enlace o ID del registro real que demuestra el resultado',
    summary: 'Qué ocurrió', summaryHint: 'Una o dos frases que describan el resultado real',
    submit: 'Registrar resultado verificado', submitting: 'Registrando…', recorded: 'Resultado verificado registrado y confirmado.', signInRequired: 'Se requiere inicio de sesión del propietario.',
  },
  pt: {
    title: 'Verificar resultados reais das respostas do COS',
    subtitle: 'Registre o que realmente aconteceu depois de usar uma resposta do COS. Resultados verificados são a evidência de produção de que as disciplinas universitárias precisam para nota A.',
    rules: 'Registre fracassos com a mesma honestidade que sucessos. Cada resposta pode ser verificada uma vez, em até 30 dias, com uma referência ao registro real (documento, chamado, URL, processo, mensagem). As disciplinas vêm da sua solicitação original, não da resposta do COS.',
    empty: 'Nenhuma resposta do COS nos últimos 30 dias.', refresh: 'Atualizar', utc: 'UTC',
    request: 'Sua solicitação', reply: 'Resposta do COS', subjects: 'Disciplinas universitárias', noSubject: 'Sem disciplina universitária — não pode ser verificada', verified: 'Resultado já verificado',
    outcome: 'O que aconteceu', success: 'Funcionou na prática', failure: 'Não funcionou na prática',
    evidence: 'Referência de evidência', evidenceHint: 'Link ou ID do registro real que comprova o resultado',
    summary: 'O que aconteceu', summaryHint: 'Uma ou duas frases descrevendo o resultado real',
    submit: 'Registrar resultado verificado', submitting: 'Registrando…', recorded: 'Resultado verificado registrado e confirmado.', signInRequired: 'É necessário login do proprietário.',
  },
  pl: {
    title: 'Weryfikacja rzeczywistych efektów odpowiedzi COS',
    subtitle: 'Zapisz, co faktycznie się stało po użyciu odpowiedzi COS. Zweryfikowane efekty są dowodem produkcyjnym, którego przedmioty uniwersyteckie wymagają do oceny A.',
    rules: 'Zapisuj porażki równie uczciwie jak sukcesy. Każdą odpowiedź można zweryfikować raz, w ciągu 30 dni, z odwołaniem do rzeczywistego zapisu (dokument, zgłoszenie, URL, akta, wiadomość). Przedmioty wynikają z Twojego pierwotnego zapytania, a nie z odpowiedzi COS.',
    empty: 'Brak odpowiedzi COS z ostatnich 30 dni.', refresh: 'Odśwież', utc: 'UTC',
    request: 'Twoje zapytanie', reply: 'Odpowiedź COS', subjects: 'Przedmioty uniwersyteckie', noSubject: 'Brak przedmiotu uniwersyteckiego — nie można zweryfikować', verified: 'Efekt już zweryfikowany',
    outcome: 'Co się stało', success: 'Zadziałało w praktyce', failure: 'Nie zadziałało w praktyce',
    evidence: 'Odwołanie do dowodu', evidenceHint: 'Link lub ID rzeczywistego zapisu potwierdzającego efekt',
    summary: 'Co się stało', summaryHint: 'Jedno lub dwa zdania opisujące rzeczywisty wynik',
    submit: 'Zapisz zweryfikowany efekt', submitting: 'Zapisywanie…', recorded: 'Zweryfikowany efekt zapisany i potwierdzony.', signInRequired: 'Wymagane logowanie właściciela.',
  },
  ru: {
    title: 'Проверка реальных результатов ответов COS',
    subtitle: 'Зафиксируйте, что на самом деле произошло после использования ответа COS. Подтверждённые результаты — это производственные доказательства, необходимые университетским предметам для оценки A.',
    rules: 'Фиксируйте неудачи так же честно, как успехи. Каждый ответ можно подтвердить один раз, в течение 30 дней, со ссылкой на реальную запись (документ, заявку, URL, дело, сообщение). Предметы определяются по вашему исходному запросу, а не по ответу COS.',
    empty: 'Нет ответов COS за последние 30 дней.', refresh: 'Обновить', utc: 'UTC',
    request: 'Ваш запрос', reply: 'Ответ COS', subjects: 'Университетские предметы', noSubject: 'Нет университетского предмета — подтвердить нельзя', verified: 'Результат уже подтверждён',
    outcome: 'Что произошло', success: 'Сработало на практике', failure: 'Не сработало на практике',
    evidence: 'Ссылка на доказательство', evidenceHint: 'Ссылка или ID реальной записи, подтверждающей результат',
    summary: 'Что произошло', summaryHint: 'Одно-два предложения о реальном результате',
    submit: 'Записать подтверждённый результат', submitting: 'Запись…', recorded: 'Подтверждённый результат записан и проверен.', signInRequired: 'Требуется вход владельца.',
  },
}
