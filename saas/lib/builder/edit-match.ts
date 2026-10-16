// saas/lib/builder/edit-match.ts
// One search/replace contract for every Builder workspace. Exact text wins; when the model's copy of the
// target differs from the file only by line endings, trailing spaces or a uniform missing indentation (the
// common ways a model re-types a block it read earlier), the edit still lands on the single matching block.
// This is the tolerance ladder established coding agents use for search/replace edits (Aider's edit blocks:
// exact match, then whitespace-flexible match). Anything looser — or any block that matches more than
// once — is refused so an edit never lands in the wrong place.

export type EditMatchResult =
  | Readonly<{
      ok: true
      content: string
      /** The exact text removed from the file and inserted into it, for audit evidence. */
      applied: Readonly<{ search: string; replace: string }>
    }>
  | Readonly<{ ok: false; error: 'builder_edit_target_not_found' | 'builder_edit_target_ambiguous' }>

const NOT_FOUND = Object.freeze({ ok: false, error: 'builder_edit_target_not_found' }) as EditMatchResult
const AMBIGUOUS = Object.freeze({ ok: false, error: 'builder_edit_target_ambiguous' }) as EditMatchResult

/** Every start offset, including overlapping ones ("aa" occurs twice in "aaa"). */
function occurrences(content: string, search: string): number[] {
  const found: number[] = []
  for (let at = content.indexOf(search); at >= 0; at = content.indexOf(search, at + 1)) found.push(at)
  return found
}

function leading(line: string): string {
  return /^[ \t]*/.exec(line)![0]
}

type Line = Readonly<{ text: string; start: number; end: number; eol: string }>

/** Lines with their byte offsets and own terminators, so an edit never rewrites untouched line endings. */
function linesOf(content: string): Line[] {
  const lines: Line[] = []
  let start = 0
  while (start <= content.length) {
    const newline = content.indexOf('\n', start)
    const stop = newline < 0 ? content.length : newline
    const crlf = newline > 0 && content[newline - 1] === '\r'
    const end = crlf ? stop - 1 : stop
    lines.push({ text: content.slice(start, end), start, end, eol: newline < 0 ? '' : crlf ? '\r\n' : '\n' })
    if (newline < 0) break
    start = newline + 1
  }
  return lines
}

/** Splice by index: String.replace would rewrite `$&`, `$'` and `$$` inside generated code. */
export function applySearchReplace(content: string, searchValue: string, replaceValue: string): EditMatchResult {
  const search = String(searchValue ?? '')
  const replace = String(replaceValue ?? '')
  if (!search) return NOT_FOUND

  const exact = occurrences(content, search)
  if (exact.length > 1) return AMBIGUOUS
  if (exact.length === 1) {
    return { ok: true, content: content.slice(0, exact[0]) + replace + content.slice(exact[0] + search.length), applied: { search, replace } }
  }

  const lines = linesOf(content)
  const wanted = search.replace(/\r\n/g, '\n').split('\n')
  if (wanted.length > 1 && wanted.at(-1) === '') wanted.pop()
  const replacement = replace.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  if (!wanted.some(line => line.trim())) return NOT_FOUND

  // Replace only the matched lines' text, joined with the matched block's own line ending.
  const splice = (first: number, block: string[]): EditMatchResult => {
    const from = lines[first].start
    const to = lines[first + wanted.length - 1].end
    const eol = lines[first].eol || '\n'
    const inserted = block.join(eol)
    return { ok: true, content: content.slice(0, from) + inserted + content.slice(to), applied: { search: content.slice(from, to), replace: inserted } }
  }

  // 1. Same lines apart from line endings and trailing spaces.
  const trailing: number[] = []
  for (let first = 0; first + wanted.length <= lines.length; first++) {
    if (wanted.every((line, i) => lines[first + i].text.trimEnd() === line.trimEnd())) trailing.push(first)
  }
  if (trailing.length > 1) return AMBIGUOUS
  if (trailing.length === 1) return splice(trailing[0], replacement)

  // 2. Same lines with one uniform indentation the model dropped; the replacement receives that indentation.
  const indented: Array<{ first: number; prefix: string }> = []
  for (let first = 0; first + wanted.length <= lines.length; first++) {
    let prefix: string | null = null
    const matches = wanted.every((line, i) => {
      const actual = lines[first + i].text
      if (!line.trim()) return !actual.trim()
      const extra = leading(actual).slice(0, leading(actual).length - leading(line).length)
      if (leading(actual) !== extra + leading(line) || actual.trim() !== line.trim()) return false
      if (prefix === null) prefix = extra
      return prefix === extra
    })
    if (matches && prefix) indented.push({ first, prefix })
  }
  if (indented.length > 1) return AMBIGUOUS
  if (indented.length === 1) {
    const { first, prefix } = indented[0]
    return splice(first, replacement.map(line => (line.trim() ? prefix + line : line)))
  }
  return NOT_FOUND
}
