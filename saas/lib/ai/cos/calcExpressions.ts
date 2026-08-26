// saas/lib/ai/cos/calcExpressions.ts
//
// THE MODEL PROPOSES THE ARITHMETIC; THE SERVER DOES IT.
//
// Established by testing on 2026-08-26: asked only for the constant, COS answers correctly —
// "8 x 700W = 5.6 kW, roughly 10-12 kW at the wall for an 8-GPU HGX H100 node". Asked for the
// same constant as one step inside a multi-step cost calculation, the same model produced
// 358 kW, then 1.5-2.0 MW, then 1.8 MW, then 83.2 kW, then "1-2 MW" — a 24x spread, across five
// runs, for a cluster whose true draw is ~640 kW.
//
// So this was never a knowledge gap and never a retrieval gap. Corpus documents were added,
// retrieval ranking was fixed, prompt rules were added; the number stayed wrong. The model can
// recall a fact, or carry a calculation, but not both at once — characteristic of a small
// active-parameter MoE, and not addressable by any prompt rule or release gate.
//
// The fix is to stop asking it to compute. The model writes the expression; this module
// evaluates it deterministically and substitutes the result. Arithmetic errors become
// structurally impossible rather than statistically less likely.
//
// SAFETY. No eval, no Function, no dynamic code path of any kind — this parses a fixed grammar
// (numbers, + - * / % ^, parentheses, unary minus) with a hand-written recursive-descent parser.
// Input is length-capped and depth-capped. Nothing reaches a JavaScript evaluator.
//
// Zero imports.

/** Longest expression accepted. Real arithmetic steps are far shorter; this bounds parser work. */
const MAX_EXPRESSION_CHARS = 200
/** Deepest parenthesis nesting accepted. */
const MAX_DEPTH = 12
/** Most markers resolved in one answer. */
const MAX_MARKERS = 60

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' | '^' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

function tokenize(source: string): Token[] | string {
  const tokens: Token[] = []
  let index = 0
  // Thousands separators are written by humans and models alike; strip them between digits only,
  // so "1,024" becomes 1024 while a stray comma remains an error.
  const text = source.replace(/(\d),(?=\d{3}\b)/g, '$1')

  while (index < text.length) {
    const char = text[index]
    if (char === ' ' || char === '\t' || char === '\n') { index += 1; continue }

    if (char >= '0' && char <= '9' || (char === '.' && /\d/.test(text[index + 1] ?? ''))) {
      const match = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(text.slice(index))
      if (!match) return `unparseable number at position ${index}`
      const value = Number(match[0])
      if (!Number.isFinite(value)) return `number out of range: ${match[0]}`
      tokens.push({ kind: 'number', value })
      index += match[0].length
      continue
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '%' || char === '^') {
      tokens.push({ kind: 'op', value: char })
      index += 1
      continue
    }
    // A model writing "x" or "×" for multiplication is writing multiplication.
    if (char === 'x' || char === 'X' || char === '\u00d7' || char === '\u00b7') {
      tokens.push({ kind: 'op', value: '*' })
      index += 1
      continue
    }
    if (char === '\u00f7') { tokens.push({ kind: 'op', value: '/' }); index += 1; continue }
    if (char === '(') { tokens.push({ kind: 'lparen' }); index += 1; continue }
    if (char === ')') { tokens.push({ kind: 'rparen' }); index += 1; continue }

    return `unsupported character ${JSON.stringify(char)} at position ${index}`
  }
  return tokens
}

/**
 * Evaluate a numeric expression. Supports + - * / % ^, parentheses and unary minus.
 *
 * Returns a structured failure rather than throwing, because a malformed expression must leave
 * the surrounding answer intact rather than break the turn.
 */
export function evaluateExpression(source: string): EvalResult {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: 'empty expression' }
  if (text.length > MAX_EXPRESSION_CHARS) return { ok: false, error: 'expression too long' }

  const tokens = tokenize(text)
  if (typeof tokens === 'string') return { ok: false, error: tokens }
  if (tokens.length === 0) return { ok: false, error: 'empty expression' }

  let position = 0
  let depth = 0
  let failure: string | null = null

  const peek = (): Token | undefined => tokens[position]

  const parseExpression = (): number => {
    let left = parseTerm()
    for (;;) {
      const token = peek()
      if (failure || !token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) break
      position += 1
      const right = parseTerm()
      left = token.value === '+' ? left + right : left - right
    }
    return left
  }

  const parseTerm = (): number => {
    let left = parseUnary()
    for (;;) {
      const token = peek()
      if (failure || !token || token.kind !== 'op') break
      if (token.value !== '*' && token.value !== '/' && token.value !== '%') break
      position += 1
      const right = parseUnary()
      if (token.value === '*') left = left * right
      else {
        if (right === 0) { failure = 'division by zero'; return 0 }
        left = token.value === '/' ? left / right : left % right
      }
    }
    return left
  }

  const parseUnary = (): number => {
    const token = peek()
    if (token && token.kind === 'op' && (token.value === '-' || token.value === '+')) {
      position += 1
      const value = parseUnary()
      return token.value === '-' ? -value : value
    }
    return parsePower()
  }

  const parsePower = (): number => {
    const base = parsePrimary()
    const token = peek()
    if (!failure && token && token.kind === 'op' && token.value === '^') {
      position += 1
      const exponent = parseUnary()   // right-associative
      return Math.pow(base, exponent)
    }
    return base
  }

  const parsePrimary = (): number => {
    const token = peek()
    if (!token) { failure = 'unexpected end of expression'; return 0 }
    if (token.kind === 'number') { position += 1; return token.value }
    if (token.kind === 'lparen') {
      depth += 1
      if (depth > MAX_DEPTH) { failure = 'expression nested too deeply'; return 0 }
      position += 1
      const value = parseExpression()
      if (failure) return 0   // report the real cause, not a spurious unbalanced-parenthesis
      const closing = peek()
      if (!closing || closing.kind !== 'rparen') { failure = 'unbalanced parenthesis'; return 0 }
      position += 1
      depth -= 1
      return value
    }
    failure = 'unexpected token'
    return 0
  }

  const value = parseExpression()
  if (failure) return { ok: false, error: failure }
  if (position !== tokens.length) return { ok: false, error: 'trailing characters in expression' }
  if (!Number.isFinite(value)) return { ok: false, error: 'result is not a finite number' }
  return { ok: true, value }
}

/**
 * Render a computed value for prose: thousands separators, and at most six significant digits so
 * floating-point noise never reaches the reader as false precision.
 */
export function formatComputed(value: number): string {
  if (!Number.isFinite(value)) return 'NaN'
  const magnitude = Math.abs(value)
  if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e12)) return value.toExponential(4)
  const rounded = Number(value.toPrecision(6))
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

/** `[[calc: 512 * 0.7]]` — the marker the reasoner is instructed to emit for every arithmetic step. */
const CALC_MARKER = /\[\[\s*calc\s*:\s*([^\]]{1,200}?)\s*\]\]/gi

export interface CalcResolution {
  text: string
  evaluated: number
  failed: Array<{ expression: string; error: string }>
}

/**
 * Replace every calc marker with its deterministically computed value.
 *
 * A marker that cannot be evaluated is left as the bare expression rather than the raw marker, so
 * a parser failure degrades to showing the reader the arithmetic instead of leaking syntax. The
 * failures are returned so the caller can log them — a rising failure rate means the reasoner is
 * writing expressions this grammar does not cover.
 */
export function resolveCalcMarkers(answer: string): CalcResolution {
  const source = String(answer ?? '')
  const failed: Array<{ expression: string; error: string }> = []
  let evaluated = 0
  let seen = 0

  const text = source.replace(CALC_MARKER, (whole, expression: string) => {
    seen += 1
    if (seen > MAX_MARKERS) return String(expression).trim()
    const result = evaluateExpression(expression)
    if (!result.ok) {
      failed.push({ expression: String(expression).trim(), error: result.error })
      return String(expression).trim()
    }
    evaluated += 1
    return formatComputed(result.value)
  })

  return { text, evaluated, failed }
}

/** True when the answer still contains an unresolved marker — used by tests and callers. */
export function hasCalcMarker(answer: string): boolean {
  CALC_MARKER.lastIndex = 0
  return CALC_MARKER.test(String(answer ?? ''))
}
