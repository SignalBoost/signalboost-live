// saas/lib/builder/planted-defect-notes.ts
//
// Production 2026-10-21 (Calculator API acceptance, builder-969cca68…): the job planted a bug, repaired it, passed
// every test and was published with src/calculator.js still saying "This function intentionally contains a bug: it
// subtracts instead of adds." A comment describing a planted defect is false once the defect is repaired, so a job
// that was asked to plant one cannot finish while delivered (non-test) source still carries such a comment.

/** The objective asks Builder to plant a defect first ("Initially implement a defective addition function"). */
export function objectivePlantsDefect(objective: string): boolean {
  return /\b(?:introduce|initially implement)\b[\s\S]{0,180}\b(?:bug|defective|incorrect)\b/i.test(objective)
}

export type PlantedDefectNote = Readonly<{ path: string; line: number; text: string }>

const SOURCE = /\.(?:[cm]?[jt]sx?|py)$/i
const TEST = /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.py$/i
// Narrow on purpose: "intentionally throws an error for invalid input" describes correct behaviour and must pass.
const NOTE = /\b(?:intentional(?:ly)?|deliberate(?:ly)?|purposely|on purpose|planted)\b.{0,80}\b(?:bug|defect(?:ive)?|incorrect\s+result|wrong\s+result)\b|\b(?:bug|defect)\b.{0,60}\b(?:will|is\s+to|to)\s+be\s+(?:caught|fixed|repaired|detected)\b|\bBUG\s*:/i

/**
 * The comments of a file with their line numbers, found lexically so a "//" or "#" inside a string or template is
 * never read as a comment (Codex on #4756: `const message = " // BUG: invalid input"` is data, not a stale note).
 * JS/TS: //, /* *\/ and ', ", ` strings (template interpolations are scanned as strings — conservative: never a
 * comment). Python: # and ', ", triple-quoted strings.
 */
function comments(path: string, content: string): Array<{ line: number; text: string }> {
  const python = /\.py$/i.test(path)
  const found: Array<{ line: number; text: string }> = []
  let line = 1
  let i = 0
  const lineAt = (from: number, to: number) => { for (let k = from; k < to; k++) if (content[k] === '\n') line++ }
  while (i < content.length) {
    const char = content[i]
    const next = content[i + 1]
    if (!python && char === '/' && next === '/') {
      const end = content.indexOf('\n', i)
      const stop = end < 0 ? content.length : end
      found.push({ line, text: content.slice(i + 2, stop).trim() })
      i = stop
      continue
    }
    if (!python && char === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2)
      const stop = end < 0 ? content.length : end + 2
      content.slice(i + 2, end < 0 ? content.length : end).split('\n').forEach((text, offset) => {
        const cleaned = text.replace(/^\s*\*?/, '').trim()
        if (cleaned) found.push({ line: line + offset, text: cleaned })
      })
      lineAt(i, stop)
      i = stop
      continue
    }
    if (python && char === '#') {
      const end = content.indexOf('\n', i)
      const stop = end < 0 ? content.length : end
      found.push({ line, text: content.slice(i + 1, stop).trim() })
      i = stop
      continue
    }
    if (char === '"' || char === "'" || (!python && char === '`')) {
      const triple = python && content.startsWith(char.repeat(3), i)
      const close = triple ? char.repeat(3) : char
      let k = i + close.length
      while (k < content.length && !content.startsWith(close, k)) {
        if (content[k] === '\\') k++
        else if (!triple && char !== '`' && content[k] === '\n') break // an unterminated quote ends at the line
        k++
      }
      const stop = Math.min(content.length, k + close.length)
      lineAt(i, stop)
      i = stop
      continue
    }
    if (char === '\n') line++
    i++
  }
  return found
}

/** Paths whose comments are checked: delivered source, never tests. */
export function plantedDefectCandidate(path: string): boolean {
  return SOURCE.test(path) && !TEST.test(path)
}

/** Comments in delivered source that still describe a planted defect. Tests may describe it; delivered code may not. */
export function plantedDefectNotes(files: readonly Readonly<{ path: string; content: string }>[]): PlantedDefectNote[] {
  const notes: PlantedDefectNote[] = []
  for (const file of files) {
    if (!plantedDefectCandidate(file.path)) continue
    for (const comment of comments(file.path, file.content)) {
      if (NOTE.test(comment.text)) notes.push({ path: file.path, line: comment.line, text: comment.text.slice(0, 200) })
    }
  }
  return notes.slice(0, 20)
}
