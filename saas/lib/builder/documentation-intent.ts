import { builderFilePath } from './file-chunks.ts'

/** Only explicit plain-document paths can enter the restricted documentation mode. */
export function builderDocumentationCandidates(objective: string): string[] {
  const matches = [...objective.matchAll(/(?<![\w./-])([\w-]+(?:\/[\w.-]+)*\.(?:md|txt|rst))(?![\w.-])/gi)]
  return [...new Set(matches.flatMap(match => {
    try { return [builderFilePath(match[1])] } catch { return [] }
  }))].slice(0, 6)
}

function explicitlyPreservedDocument(objective: string, path: string): boolean {
  return objective.split(/[;\n]|[.!?](?=\s|$)/).some(clause => clause.includes(path)
    && (/(?:do not|don't|never)\s+(?:edit|modify|change|overwrite|delete|remove|write)\b/i.test(clause)
      || /\b(?:keep|leave|preserve)\b.*\b(?:unchanged|read.only|unmodified|untouched)\b/i.test(clause)))
}

export function validBuilderDocumentationScope(objective: string, paths: readonly string[]): boolean {
  const candidates = builderDocumentationCandidates(objective)
  return paths.length > 0 && paths.length <= 6 && paths.every(path => candidates.includes(path) && !explicitlyPreservedDocument(objective, path))
}

