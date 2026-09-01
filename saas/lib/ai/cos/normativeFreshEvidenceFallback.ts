import type { FreshEvidenceSource } from './cosFreshGrounding.ts'
import { isNormativePolicyQuestion } from './normativeAnswerPolicy.ts'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Language, { opening: string; evidence: string; boundary: string }> = {
  en: {
    opening: 'This policy question involves competing principles, so the current evidence is presented before any value judgment.',
    evidence: 'Current evidence',
    boundary: 'These sources can establish descriptive facts and institutional positions. Whether the proposed policy should be adopted still depends on how competing principles and affected interests are weighed.',
  },
  es: {
    opening: 'Esta cuestión de política pública implica principios contrapuestos, por lo que la evidencia actual se presenta antes de cualquier juicio de valor.',
    evidence: 'Evidencia actual',
    boundary: 'Estas fuentes pueden establecer hechos descriptivos y posiciones institucionales. La adopción de la política propuesta depende de cómo se ponderen los principios y los intereses afectados.',
  },
  pt: {
    opening: 'Esta questão de política pública envolve princípios concorrentes, por isso as evidências atuais são apresentadas antes de qualquer juízo de valor.',
    evidence: 'Evidências atuais',
    boundary: 'Essas fontes podem estabelecer fatos descritivos e posições institucionais. A adoção da política proposta ainda depende de como os princípios e os interesses afetados são ponderados.',
  },
  pl: {
    opening: 'To pytanie dotyczące polityki publicznej obejmuje konkurujące zasady, dlatego aktualne dowody przedstawiono przed oceną wartościującą.',
    evidence: 'Aktualne dowody',
    boundary: 'Źródła te mogą ustalić fakty opisowe i stanowiska instytucjonalne. Przyjęcie proponowanej polityki nadal zależy od sposobu wyważenia konkurujących zasad i interesów zainteresowanych stron.',
  },
  ru: {
    opening: 'Этот вопрос государственной политики затрагивает конкурирующие принципы, поэтому сначала приводятся актуальные данные.',
    evidence: 'Актуальные данные',
    boundary: 'Эти источники могут установить описательные факты и позиции организаций. Выбор политики все еще зависит от того, как взвешиваются конкурирующие принципы и интересы.',
  },
}

function languageOf(value: string): Language {
  const code = String(value || 'en').slice(0, 2).toLowerCase()
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}

function clean(value: string, limit: number): string {
  const text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  const shortened = text.slice(0, limit + 1).replace(/\s+\S*$/, '').trim()
  return `${shortened}…`
}

/** Evidence-only recovery when the local model times out before it can safely synthesize. */
export function buildNormativeFreshEvidenceFallback(args: {
  input: string
  sources: FreshEvidenceSource[]
  language: string
}): string | null {
  if (!isNormativePolicyQuestion(args.input) || !args.sources.length) return null
  const copy = COPY[languageOf(args.language)]
  const items = args.sources.slice(0, 4).map(source => {
    const title = clean(source.title, 180) || source.id
    const snippet = clean(source.snippet, 420)
    return `- **${title}**${snippet ? `: ${snippet}` : ''} [${source.id}](${source.url})`
  })
  return `${copy.opening}\n\n**${copy.evidence}**\n\n${items.join('\n')}\n\n${copy.boundary}`
}
