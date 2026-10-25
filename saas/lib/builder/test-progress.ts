// saas/lib/builder/test-progress.ts
//
// How a build's test runs are judged between repairs, as harness engineering does it (LangChain's Terminal-Bench
// harness work; Aider and SWE-agent keep the test result on every turn): each run's own pass/fail score, the best
// score so far, how many runs since then did not beat it, and what each failing test expected versus what it got.
// Production 2026-10-24 (LibraryFlow, run 3): 186 steps, about 66 edits and 35 test runs in 60 minutes ended at
// 25 of 28 passing; the harness kept no per-run score, never noticed the repairs were not improving, and showed the
// model raw output instead of each failing assertion.

import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'

export type BuilderTestScore = Readonly<{ passed: number; failed: number }>

export type BuilderFailingTest = Readonly<{
  name: string
  /** Workspace-relative test location of the failing assertion, e.g. test/reports.test.js:50 */
  location?: string
  message?: string
  expected?: string
  actual?: string
}>

/** Runs that did not beat the best score before the harness asks the model to step back and re-diagnose. */
export const BUILDER_STUCK_RUNS = 3

const SUMMARY_PASS = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/
const SUMMARY_FAIL = /(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/

function runText(receipt: BuilderV2Receipt): string {
  const output = receipt.output as { stdout?: unknown; stderr?: unknown } | undefined
  return [output?.stdout, output?.stderr].filter((part): part is string => typeof part === 'string').join('\n')
}

/** A test run's own score from the node:test summary (spec or TAP), or the score kept on a compacted receipt. */
export function builderTestRunScore(receipt: BuilderV2Receipt): BuilderTestScore | null {
  if (receipt.tool !== 'run_tests') return null
  const kept = (receipt.output as { score?: { passed?: unknown; failed?: unknown } } | undefined)?.score
  if (kept && Number.isSafeInteger(kept.passed) && Number.isSafeInteger(kept.failed)) {
    return { passed: kept.passed as number, failed: kept.failed as number }
  }
  const text = runText(receipt)
  const pass = SUMMARY_PASS.exec(text)
  if (!pass) return null
  const fail = SUMMARY_FAIL.exec(text)
  return { passed: Number(pass[1]), failed: fail ? Number(fail[1]) : 0 }
}

const runCommand = (receipt: BuilderV2Receipt) => (receipt.output as { requestedCommand?: unknown } | undefined)?.requestedCommand

/**
 * The best score so far, the step it was reached at, and how many scored runs since then did not beat it. Scores are
 * only comparable for the same command (a run of one test file is not a regression of the full suite): pass the
 * command, or by default the command of the latest scored run.
 */
export function builderTestProgress(steps: readonly BuilderV2Receipt[], command?: string): Readonly<{
  best: BuilderTestScore | null
  bestAt: number
  latest: BuilderTestScore | null
  runsWithoutImprovement: number
}> {
  let best: BuilderTestScore | null = null
  let bestAt = -1
  let latest: BuilderTestScore | null = null
  let runsWithoutImprovement = 0
  const scoped = command ?? runCommand([...steps].reverse().find(receipt => builderTestRunScore(receipt)) ?? steps[0] ?? { tool: 'run_tests', ok: false, changed: false })
  steps.forEach((receipt, at) => {
    const score = builderTestRunScore(receipt)
    if (!score || runCommand(receipt) !== scoped) return
    latest = score
    if (!best || score.passed > best.passed || (score.passed === best.passed && score.failed < best.failed)) {
      best = score
      bestAt = at
      runsWithoutImprovement = 0
    } else {
      runsWithoutImprovement++
    }
  })
  return { best, bestAt, latest, runsWithoutImprovement }
}

/** A run is a regression when it passes fewer tests than the best version so far. */
export function builderTestRegression(best: BuilderTestScore | null, score: BuilderTestScore | null): boolean {
  return Boolean(best && score && score.passed < best.passed)
}

const quoted = (value: string) => value.trim().replace(/^'([\s\S]*)'$/, '$1').slice(0, 300)

function workspaceLocation(text: string, knownFiles: readonly string[]): string | undefined {
  for (const match of text.matchAll(/((?:test|tests|src)\/[A-Za-z0-9_./-]+\.[cm]?js):(\d+)(?::\d+)?/g)) {
    if (knownFiles.includes(match[1])) return `${match[1]}:${match[2]}`
  }
  return undefined
}

function detailFields(block: string, knownFiles: readonly string[]): Omit<BuilderFailingTest, 'name'> {
  const expected = /^\s*expected:\s*(.+)$/m.exec(block)?.[1]
  const actual = /^\s*actual:\s*(.+)$/m.exec(block)?.[1]
  const message = /^\s*(?:error:\s*)?((?:\w+Error|AssertionError)\b[^\n]*|Expected[^\n]*)/m.exec(block)?.[1]
    ?? /^\s*error:\s*(.+)$/m.exec(block)?.[1]
  // The assertion's own line in the test file: the stack frame, not the test's declaration line.
  const stack = block.slice(Math.max(0, block.search(/\bat\s|stack:/)))
  const location = workspaceLocation(stack, knownFiles) ?? workspaceLocation(block, knownFiles)
  return {
    ...(location ? { location } : {}),
    ...(message ? { message: quoted(message) } : {}),
    ...(expected !== undefined ? { expected: quoted(expected.replace(/,\s*$/, '')) } : {}),
    ...(actual !== undefined ? { actual: quoted(actual.replace(/,\s*$/, '')) } : {}),
  }
}

/**
 * Each failing test of the latest run with what it expected and what it got, parsed from node:test spec output
 * (the "✖ failing tests:" section) or TAP ("not ok" blocks). At most `limit` tests.
 */
export function builderFailingTests(receipt: BuilderV2Receipt | undefined, knownFiles: readonly string[], limit = 6): BuilderFailingTest[] {
  if (!receipt || receipt.tool !== 'run_tests' || receipt.ok) return []
  const text = runText(receipt)
  const found = new Map<string, BuilderFailingTest>()
  const spec = text.indexOf('✖ failing tests:')
  if (spec >= 0) {
    const section = text.slice(spec + '✖ failing tests:'.length)
    const blocks = section.split(/\n(?=\s*✖ )/)
    for (const block of blocks) {
      const name = /^\s*✖\s+(.+?)\s+\(\d[\d.]*m?s\)/.exec(block)?.[1]
      if (name && !found.has(name)) found.set(name, { name, ...detailFields(block, knownFiles) })
    }
  }
  // Failures inside describe/it suites are indented; the suite's own entry only says its subtests failed
  // (Codex on #4868), so it is skipped in favour of the failing assertion itself.
  for (const match of text.matchAll(/^([ \t]*)not ok \d+ - (.+)\n((?:\1[ \t]+.*\n?)*)/gm)) {
    const name = match[2].trim()
    const block = match[3].split(/\n[ \t]*\.\.\.\s*(?:\n|$)/)[0]
    if (/failureType:\s*'subtestsFailed'/.test(block) || found.has(name)) continue
    found.set(name, { name, ...detailFields(block, knownFiles) })
  }
  if (!found.size) {
    // A spec run without the summary section: the inline ✖ lines still name the tests.
    for (const match of text.matchAll(/^\s*✖\s+(.+?)\s+\(\d[\d.]*m?s\)/gm)) {
      if (!/^failing tests:?$/i.test(match[1]) && !found.has(match[1])) found.set(match[1], { name: match[1] })
    }
  }
  return [...found.values()].slice(0, limit)
}

/** The lines around a failing assertion, so the model sees the test's intent next to its expected/actual values. */
export function builderAssertionSnippet(content: string, line: number, radius = 8): string {
  const lines = content.split('\n')
  const from = Math.max(0, line - 1 - radius)
  const to = Math.min(lines.length, line + radius)
  return lines.slice(from, to).map((text, index) => `${from + index + 1}${from + index + 1 === line ? '>' : ' '} ${text}`).join('\n')
}
