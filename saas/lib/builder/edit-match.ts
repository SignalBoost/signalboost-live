// saas/lib/builder/edit-match.ts
// One search/replace contract for every Builder workspace. Exact text wins; when the model's copy of the
// target differs from the file only by line endings, trailing spaces or a uniform missing indentation (the
// common ways a model re-types a block it read earlier), the edit still lands on the single matching block.
// This is the tolerance ladder established coding agents use for search/replace edits (Aider's edit blocks:
// exact match, then whitespace-flexible match). Anything looser — or any block that matches more than
// once — is refused so an edit never lands in the wrong place.

export type EditMatchResult =
  | Readonly<{ ok: true; content: string }>
  | Readonly<{ ok: false; error: 'builder_edit_target_not_found' | 'builder_edit_target_ambiguous' }>

const NOT_FOUND = Object.freeze({ ok: false, error: 'builder_edit_target_not_found' }) as EditMatchResult
const AMBIGUOUS = Object.freeze({ ok: false, error: 'builder_edit_target_ambiguous' }) as EditMatchResult

function occurrences(content: string, search: string): number[] {
  const found: number[] = []
  for (let at = content.indexOf(search); at >= 0; at = content.indexOf(search, at + search.length)) found.push(at)
  return found
}

function leading(line: string): string {
  return /^[ \t]*/.exec(line)![0]
}

/** Splice by index: String.replace would rewrite `$&`, `$'` and `$$` inside generated code. */
export function applySearchReplace(content: string, searchValue: string, replaceValue: string): EditMatchResult {
  const search = String(searchValue ?? '')
  const replace = String(replaceValue ?? '')
  if (!search) return NOT_FOUND

  const exact = occurrences(content, search)
  if (exact.length > 1) return AMBIGUOUS
  if (exact.length === 1) return { ok: true, content: content.slice(0, exact[0]) + replace + content.slice(exact[0] + search.length) }

  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const wanted = search.replace(/\r\n/g, '\n').split('\n')
  if (wanted.length > 1 && wanted.at(-1) === '') wanted.pop()
  const replacement = replace.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  if (!wanted.some(line => line.trim())) return NOT_FOUND

  const splice = (start: number, block: string[]): EditMatchResult => ({
    ok: true,
    content: [...lines.slice(0, start), ...block, ...lines.slice(start + wanted.length)].join(eol),
  })

  // 1. Same lines apart from line endings and trailing spaces.
  const trailing: number[] = []
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    if (wanted.every((line, i) => lines[start + i].trimEnd() === line.trimEnd())) trailing.push(start)
  }
  if (trailing.length > 1) return AMBIGUOUS
  if (trailing.length === 1) return splice(trailing[0], replacement)

  // 2. Same lines with one uniform indentation the model dropped; the replacement receives that indentation.
  const indented: Array<{ start: number; prefix: string }> = []
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    let prefix: string | null = null
    const matches = wanted.every((line, i) => {
      const actual = lines[start + i]
      if (!line.trim()) return !actual.trim()
      const extra = leading(actual).slice(0, leading(actual).length - leading(line).length)
      if (leading(actual) !== extra + leading(line) || actual.trim() !== line.trim()) return false
      if (prefix === null) prefix = extra
      return prefix === extra
    })
    if (matches && prefix) indented.push({ start, prefix })
  }
  if (indented.length > 1) return AMBIGUOUS
  if (indented.length === 1) {
    const { start, prefix } = indented[0]
    return splice(start, replacement.map(line => (line.trim() ? prefix + line : line)))
  }
  return NOT_FOUND
}
