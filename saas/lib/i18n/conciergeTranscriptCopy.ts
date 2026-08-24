export type ConciergeTranscriptLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  en: {
    title: 'Conversation transcript',
    retained: 'The complete exchange stays visible here so you can review or copy it.',
    turn: 'Exchange',
    copyFull: 'Copy full exchange',
    copyQuestion: 'Copy question',
    copyResponse: 'Copy response',
    copied: 'Copied',
  },
  es: {
    title: 'Transcripción de la conversación',
    retained: 'El intercambio completo permanece visible aquí para que puedas revisarlo o copiarlo.',
    turn: 'Intercambio',
    copyFull: 'Copiar intercambio completo',
    copyQuestion: 'Copiar pregunta',
    copyResponse: 'Copiar respuesta',
    copied: 'Copiado',
  },
  pt: {
    title: 'Transcrição da conversa',
    retained: 'A conversa completa permanece visível aqui para você revisar ou copiar.',
    turn: 'Troca',
    copyFull: 'Copiar conversa completa',
    copyQuestion: 'Copiar pergunta',
    copyResponse: 'Copiar resposta',
    copied: 'Copiado',
  },
  pl: {
    title: 'Zapis rozmowy',
    retained: 'Cała rozmowa pozostaje tutaj widoczna, aby można ją było przejrzeć lub skopiować.',
    turn: 'Wymiana',
    copyFull: 'Kopiuj całą rozmowę',
    copyQuestion: 'Kopiuj pytanie',
    copyResponse: 'Kopiuj odpowiedź',
    copied: 'Skopiowano',
  },
  ru: {
    title: 'История разговора',
    retained: 'Весь диалог остаётся здесь видимым, чтобы его можно было просмотреть или скопировать.',
    turn: 'Обмен',
    copyFull: 'Копировать весь диалог',
    copyQuestion: 'Копировать вопрос',
    copyResponse: 'Копировать ответ',
    copied: 'Скопировано',
  },
} as const

export function getConciergeTranscriptCopy(locale: string) {
  const normalized = (['en', 'es', 'pt', 'pl', 'ru'].includes(locale) ? locale : 'en') as ConciergeTranscriptLocale
  return COPY[normalized]
}
