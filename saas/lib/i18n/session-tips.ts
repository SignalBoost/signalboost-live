// saas/lib/i18n/session-tips.ts
// Copy for session-tips UI in EN / PT (BR+PT) / ES (ES+LATAM).
// No assistant brand name is used — kept model-agnostic per project rules.

export type Locale = "en" | "pt" | "es";

export const sessionTipsCopy = {
  en: {
    bannerTitle: "Working on a long project? A few tips:",
    bannerTips: [
      "Keep sessions to 2–3 hours max.",
      'At the end of each session, ask the assistant: "Summarize everything we did today so I can start a new session."',
      "Save that summary in a notes file.",
      "Start your next session by pasting that summary in.",
    ],
    dismiss: "Got it",
    timerWarningTitle: "Heads up — this session is getting long",
    timerWarningBody:
      "You've been working for over 2 hours. A good moment to ask for a session summary and save it before continuing.",
    summarizeButton: "Generate session summary",
    summarizePrompt:
      "Summarize everything we did in this session: decisions made, files changed, problems solved, and what's still pending. Format it so I can paste it into a new session to continue without losing context.",
    docsHeading: "Working across multiple sessions",
    docsIntro:
      "Long projects work best when you treat each working block like a chapter. Here's the workflow we recommend:",
  },
  pt: {
    bannerTitle: "Em um projeto longo? Algumas dicas:",
    bannerTips: [
      "Mantenha sessões de no máximo 2 a 3 horas.",
      'Ao final de cada sessão, peça ao assistente: "Resuma tudo o que fizemos hoje para eu começar uma nova sessão."',
      "Salve esse resumo em um arquivo de notas.",
      "Comece a próxima sessão colando esse resumo.",
    ],
    dismiss: "Entendi",
    timerWarningTitle: "Atenção — esta sessão está ficando longa",
    timerWarningBody:
      "Você está trabalhando há mais de 2 horas. Um bom momento para pedir um resumo da sessão e salvá-lo antes de continuar.",
    summarizeButton: "Gerar resumo da sessão",
    summarizePrompt:
      "Resuma tudo o que fizemos nesta sessão: decisões tomadas, arquivos alterados, problemas resolvidos e o que ainda está pendente. Formate de modo que eu possa colar em uma nova sessão e continuar sem perder o contexto.",
    docsHeading: "Trabalhando em várias sessões",
    docsIntro:
      "Projetos longos funcionam melhor quando você trata cada bloco de trabalho como um capítulo. Este é o fluxo que recomendamos:",
  },
  es: {
    bannerTitle: "¿Trabajando en un proyecto largo? Algunos consejos:",
    bannerTips: [
      "Mantén las sesiones en un máximo de 2 a 3 horas.",
      'Al final de cada sesión, pídele al asistente: "Resume todo lo que hicimos hoy para que pueda iniciar una nueva sesión."',
      "Guarda ese resumen en un archivo de notas.",
      "Empieza la siguiente sesión pegando ese resumen.",
    ],
    dismiss: "Entendido",
    timerWarningTitle: "Aviso — esta sesión se está alargando",
    timerWarningBody:
      "Llevas más de 2 horas trabajando. Buen momento para pedir un resumen de la sesión y guardarlo antes de seguir.",
    summarizeButton: "Generar resumen de la sesión",
    summarizePrompt:
      "Resume todo lo que hicimos en esta sesión: decisiones tomadas, archivos modificados, problemas resueltos y lo que queda pendiente. Dale formato para que pueda pegarlo en una nueva sesión y continuar sin perder contexto.",
    docsHeading: "Trabajando en varias sesiones",
    docsIntro:
      "Los proyectos largos funcionan mejor si tratas cada bloque de trabajo como un capítulo. Este es el flujo que recomendamos:",
  },
} as const;

export function getSessionTipsCopy(locale: Locale) {
  return sessionTipsCopy[locale] ?? sessionTipsCopy.en;
}
