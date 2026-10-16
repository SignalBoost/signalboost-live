// saas/lib/ai/cos/agentLoop/agentToolIntent.ts
//
// Host release guard for the agent loop, in the same role as the freshness guard: the planner model
// decides first, but a request to chart data must never reach image generation (which draws a
// picture, not the data) or a one-pass answer that cannot compute. Chart words alone are not enough:
// "draw a graphic of a cat" stays a picture.

const CHART_WORD = /\b(?:charts?|graphs?|graphics?|plot|plotting|visuali[sz]e|visuali[sz]ation|diagram)\b|\bgr[aá]fic[oa]s?\b|\bgr[aá]fico\b|\bwykres\w*|\bgraphique\b|\bgrafik\b|график|\bdiagramm\w*|グラフ|그래프|رسم\s+بياني|مخطط/iu
const DATA_WORD = /\b(?:prices?|stocks?|shares?|ticker|rates?|inflation|gdp|sales|revenue|data|dataset|statistics?|stats|trend|over\s+(?:time|the\s+(?:past|last))|past\s+(?:\d+|one|two|three|six|twelve)\s+(?:days?|weeks?|months?|years?)|monthly|yearly|annual|daily|weekly|percent(?:age)?|growth|population|temperature|csv|table|numbers|figures|history|historical|precios?|datos|ventas|tasas?|inflaci[oó]n|poblaci[oó]n|acci[oó]n(?:es)?|cotizaci[oó]n|pre[cç]os?|dados|vendas|cena|dane|kurs|preis\w*|daten|prix|donn[ée]es|prezzi|dati)\b|цен[аыу]|данны[ехм]|株価|データ|가격|데이터|سعر|أسعار|بيانات/iu
const REFERS_TO_PRIOR = /\b(?:it|that|this|those|these|same|above|info|information|data|numbers|figures|you\s+provided|you\s+gave|based\s+on|eso|esto|esa|esos|informaci[oó]n|que\s+(?:me\s+)?diste)\b/iu

function figureCount(text: string): number {
  return (String(text || '').match(/\d[\d,.]*\d|\d/g) || []).length
}

export function requiresAgentTools(prompt: string, priorAnswer?: string | null): boolean {
  const text = String(prompt || '')
  if (!CHART_WORD.test(text)) return false
  if (DATA_WORD.test(text)) return true
  // "based on the info you provided you can draw a graphic": the data is in the previous answer.
  return REFERS_TO_PRIOR.test(text) && figureCount(String(priorAnswer || '')) >= 2
}
