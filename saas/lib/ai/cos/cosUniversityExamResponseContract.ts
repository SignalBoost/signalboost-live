/** Public output constraints only. Do not serialize the private examination rubric. */
export type UniversityResponseContract = Readonly<{
  version: 'university_response_contract_v1'
  maxWords: number
  counting: 'whitespace_separated_tokens'
  scope: 'entire_final_response'
}>
type ExamInput = Readonly<{
  prompt: string
  rubric: Readonly<{ maxWords?: number }>
  target: Readonly<{ kind: string; language?: string }>
}>

export function universityExamResponseContract(exam: ExamInput): UniversityResponseContract | null {
  const maxWords = exam.rubric.maxWords
  if (maxWords === undefined) return null
  if (!Number.isSafeInteger(maxWords) || maxWords <= 0) throw new Error('university_exam_word_limit_invalid')
  return Object.freeze({ version: 'university_response_contract_v1', maxWords,
    counting: 'whitespace_separated_tokens', scope: 'entire_final_response' })
}

/** Match the existing scorer's /\S+/g count, including headings and numbered labels. */
const instructions: Readonly<Record<string, (limit: number) => string>> = {
  en: limit => `Response limit: at most ${limit} words in the entire final response, including headings and numbered labels. Words are counted as non-whitespace tokens separated by whitespace. Follow any stricter limit in the task.`,
  es: limit => `Límite de respuesta: un máximo de ${limit} palabras en toda la respuesta final, incluidos los títulos y las etiquetas numeradas. Cada elemento separado por espacios en blanco cuenta como una palabra. Respeta cualquier límite más estricto indicado en la tarea.`,
  pt: limit => `Limite da resposta: no máximo ${limit} palavras em toda a resposta final, incluindo títulos e rótulos numerados. Cada elemento separado por espaços em branco conta como uma palavra. Respeite qualquer limite mais restritivo indicado na tarefa.`,
  pl: limit => `Limit odpowiedzi: najwyżej ${limit} słów w całej odpowiedzi końcowej, w tym nagłówki i oznaczenia numerowane. Każdy ciąg znaków oddzielony białymi znakami liczy się jako jedno słowo. Przestrzegaj również każdego bardziej restrykcyjnego limitu podanego w zadaniu.`,
  ru: limit => `Ограничение ответа: не более ${limit} слов во всём окончательном ответе, включая заголовки и нумерацию. Каждая последовательность непробельных символов, отделённая пробелом или переносом строки, считается одним словом. Соблюдайте более строгие ограничения, указанные в задании.`,
}

/**
 * Project the existing numeric response ceiling at execution, preserving the immutable canonical
 * case, rubric and manifest. The bound executor hashes this actual input in its prompt provenance.
 */
export function universityIndependentLearnerPrompt(exam: ExamInput): string {
  const contract = universityExamResponseContract(exam)
  if (!contract) return exam.prompt
  const language = exam.target.kind === 'language' ? exam.target.language || '' : 'en'
  const render = Object.hasOwn(instructions, language) ? instructions[language] : undefined
  if (!render) throw new Error('university_exam_response_language_invalid')
  return `${exam.prompt}\n\n${render(contract.maxWords)}`
}
