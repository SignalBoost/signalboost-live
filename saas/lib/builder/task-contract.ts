import type { BuilderToolTrace } from './contracts.ts'
import { opensWithCreationDirective } from './regression-gate.ts'

export type BuilderTaskContract = Readonly<{ files: readonly string[]; commands: readonly string[]; requiresRun: boolean; minimumTests: number }>

const FILE = /^(?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]+$/i
// "├── src/", "│   └── cart.js", "|-- index.js": captures the indentation before the branch and the entry name.
const TREE_BRANCH = /^([ │|]*?)(?:[├└]──|[|`+]--)\s*([\w.-]+\/?)\s*$/
/** Depth of a drawn tree entry (1 = directly under the root), or 0 when the line is not a tree entry. */
function treeDepth(raw: string | undefined): number {
  const branch = TREE_BRANCH.exec(raw ?? '')
  return branch ? Math.round(branch[1].replace(/│|\|/g, ' ').length / 4) + 1 : 0
}
const clean = (value: string) => value.trim().replace(/^[-*]\s+/, '').replace(/^`|`[.,;]?$|[.,;]$/g, '')

/** Inline Run: clauses end at an unquoted sentence boundary, never inside a filename. */
function inlineCommands(line: string): string[] {
  const visible = line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, match => ' '.repeat(match.length))
  const result: string[] = []
  for (const match of visible.matchAll(/(?:^|[.!?]\s+)(?:also\s+)?run\s*:/gi)) {
    const start = match.index + match[0].length
    let end = start
    let quote = ''
    for (; end < line.length; end++) {
      const char = line[end]
      if (char === '\\') { end++; continue }
      if (quote) { if (char === quote) quote = ''; continue }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue }
      if (char === '.' && (end === line.length - 1 || /\s/.test(line[end + 1]))) break
    }
    const command = clean(line.slice(start, end))
    if (/^(?:node|python3?|npm|pnpm|yarn|bun)\s+\S/.test(command) && command.length <= 2000) result.push(command)
  }
  return result
}

/**
 * The request whose checklist a job must satisfy. A "continue" in the same project keeps the original request's
 * required files and commands; otherwise a resumed build would have an empty checklist and could stop early.
 */
export function builderContractObjective(objective: string, projectContext?: unknown): string {
  const previous = projectContext && typeof projectContext === 'object'
    ? (projectContext as { previousObjective?: unknown }).previousObjective : undefined
  return /^\s*(?:please\s+)?continue\b/i.test(objective) && typeof previous === 'string' && previous.trim()
    ? `${previous}\n\n${objective}` : objective
}

/** Extract explicit deliverables only; references elsewhere in the request are not output files. */
export function builderTaskContract(objective: string): BuilderTaskContract {
  const files = new Set<string>()
  const commands = new Set<string>()
  let fileList = false
  let runList = false
  let fence = false
  const tree: string[] = []
  const lines = objective.split(/\r?\n/)
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    // Markdown acceptance specifications place deliverable lists inside fenced
    // blocks. The fence is a delimiter, not a missing file or command.
    if (/^```/.test(line)) {
      fence = !fence
      continue
    }
    // Only a fenced block under an explicit deliverable/verification heading is a checklist.
    if (fence && !fileList && !runList) continue
    if (!fence && /^#{1,6}\s/.test(line)) {
      fileList = /(?:required files|project structure|file structure|deliverables)/i.test(line)
      runList = /(?:required execution|verification commands|mandatory verification)/i.test(line)
      tree.length = 0
      continue
    }
    // A bare "Execute:" or "Run:" line introduces the command list, as in the owner's Calculator API acceptance spec.
    if (/^run(?:\s+(?:these|the following)\s+commands)?(?:\s+against\s+the\s+actual\s+generated\s+files)?\s*:\s*$/i.test(line) || /^execute(?:\s+(?:these|the following|all(?:\s+\w+)?)\s+commands(?:\s+in\s+the\s+builder\s+workspace)?)?\s*:\s*$/i.test(line)) {
      runList = true
      fileList = false
      continue
    }
    // "Create an isolated Node.js project with the following files:" introduces the file list like "Create these files:".
    if (/^(?:(?:create|write|deliver|provide)(?:\s+(?:these|the|following|files|all|at least))*|(?:required\s+)?(?:project\s+)?(?:file\s+)?structure)\s*:\s*$/i.test(line) || /^create\s+at\s+least\s+(?:these|the|following)\s+files\s*:\s*$/i.test(line) || /^create\s+all\s+\d+\s+files\s*:\s*$/i.test(line)
      || /^(?:create|build|write)\b[^:]{0,120}\bwith\s+the\s+following\s+files\s*:\s*$/i.test(line)) {
      fileList = true
      continue
    }
    if (fileList && line) {
      // A drawn tree names entries without their parent directory. Rebuild each path from its depth;
      // the glyph-less top-level "project/" line is the workspace root itself, not a subdirectory.
      const branch = TREE_BRANCH.exec(raw)
      if (branch || (fence && tree.length === 0 && /^[\w.-]+\/?$/.test(line) && treeDepth(lines[index + 1]) > 0)) {
        const depth = branch ? treeDepth(raw) : 0
        const name = branch ? branch[2] : ''
        tree.length = Math.min(tree.length, depth)
        // `tree` prints directories without a trailing slash ("├── src", "├── src.v2"): an entry is a directory
        // when it ends in "/" or the next tree entry is nested deeper under it.
        if (!branch || name.endsWith('/') || treeDepth(lines[index + 1]) > depth) { tree[depth] = branch ? name.replace(/\/$/, '') : ''; continue }
        const path = [...tree.slice(1, depth), name].filter(Boolean).join('/')
        if (FILE.test(path) && !path.split('/').includes('..')) files.add(path)
        continue
      }
      const path = clean(line).replace(/^\d+[.)]\s*/, '')
      if (FILE.test(path) && !path.split('/').includes('..')) files.add(path)
      else fileList = false
    }
    for (const inline of line.matchAll(/\b(?:create|write)\s+`?((?:[\w-]+\/)*[\w.-]+\.[a-z0-9]+)\b/gi)) {
      if (FILE.test(inline[1])) files.add(inline[1])
    }
    for (const command of inlineCommands(line)) commands.add(command)
    const command = line.replace(/^\$\s+/, '').replace(/^`|`$/g, '')
    if (runList && /^(?:node|python3?|npm|pnpm|yarn|bun)\s+\S/.test(command) && command.length <= 2_000) commands.add(command)
    else if (line && !fence) runList = false
  }
  // Markdown emphasis ("at least **20 meaningful automated tests**") must not hide the requested count.
  const plain = objective.replace(/\*\*|__/g, '')
  const explicitCount = /\b(?:at least|minimum(?: of)?|all|verify|confirm)\s+(\d+)\s+(?:(?:independent|meaningful|automated|unit|integration|regression)\s+)*tests?\b/i.exec(plain)
  const wordCount = /\b(?:all|verify|confirm)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+tests?\b/i.exec(plain)
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  const hasTestCommand = [...commands].some(command => /\b(?:test|spec)\b|--test\b/i.test(command)) || /\bnode\s+(?:--test\s+)?[^\s\n]*(?:test|spec)[^\s\n]*\.(?:[cm]?js|ts)\b/i.test(objective)
  const minimumTests = hasTestCommand ? (explicitCount ? Number(explicitCount[1]) : wordCount ? words[wordCount[1].toLowerCase()] : 0) : 0
  return { files: [...files], commands: [...commands], requiresRun: commands.size > 0 || /\b(?:run|execute|test|verify)\b/i.test(objective), minimumTests }
}

export function builderTaskProgress(contract: BuilderTaskContract, paths: readonly string[], trace: readonly BuilderToolTrace[]) {
  const missingFiles = contract.files.filter(path => !paths.includes(path))
  const lastChange = trace.findLastIndex(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  // Denied repeat controls never executed. They cannot supersede an earlier real
  // command result or erase its evidence when computing completion.
  const recent = trace.slice(lastChange + 1).filter(item => item.toolId === 'run'
    && !String(item.error || '').startsWith('builder_repeated_tool_call:'))
  const passed = (command: string) => {
    const latest = recent.findLast(item => item.input.command === command || item.input.requestedCommand === command)
    const output = latest?.output as { exitCode?: number; timedOut?: boolean } | undefined
    return latest?.ok === true && output?.exitCode === 0 && output?.timedOut !== true
  }
  const pendingCommands = contract.commands.filter(command => !passed(command))
  // A successful smoke command must not conceal a later failed verification on the same source revision.
  // Refused repeats and policy-denied calls are not executed verification failures.
  const lastExecutedRun = recent.findLast(item => typeof item.input.command === 'string'
    && typeof (item.output as { exitCode?: unknown } | undefined)?.exitCode === 'number')
  const latestRunFailed = Boolean(lastExecutedRun && (lastExecutedRun.ok !== true
    || (lastExecutedRun.output as { exitCode?: number }).exitCode !== 0))
  const hasProof = recent.some(item => typeof item.input.command === 'string' && passed(item.input.command))
  const testsSatisfied = contract.minimumTests === 0 || recent.some(item => {
    if (typeof item.input.command !== 'string' || !passed(item.input.command) || !/\b(?:--test|test)\b/.test(item.input.command)) return false
    const output = item.output as { stdout?: string }
    const stdout = output.stdout || ''
    const passes = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)
    const failures = /(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/.exec(stdout)
    if (passes) return Number(passes[1]) >= contract.minimumTests && failures?.[1] === '0'
    // A plain node test.js may print one success line per assertion rather than a TAP summary.
    // Count distinct numbered assertions; a zero exit alone cannot prove four requested tests.
    const numbered = new Set([...stdout.matchAll(/(?:^|\n)\s*(?:test\s*#?\s*(\d+)\s*(?:passed|ok)|(?:ok|passed)\s+test\s*#?\s*(\d+))\b/gi)].map(m => m[1] || m[2]))
    return numbered.size >= contract.minimumTests
  })
  return {
    missingFiles,
    pendingCommands,
    minimumTests: contract.minimumTests,
    testsSatisfied,
    satisfied: missingFiles.length === 0 && pendingCommands.length === 0 && testsSatisfied && !latestRunFailed && (!contract.requiresRun || hasProof),
  }
}

const EXTENDS_EXISTING_PROJECT = /\b(?:existing|current)\s+(?:app|application|project|codebase|repo|repository|service|code)\b/i

/**
 * A complete new-application specification: the first instruction builds/creates something, the request lists
 * at least two required files, and it does not name an existing application it extends. Such a request creates
 * source rather than resuming it, so an empty selected workspace is a valid target. A request that extends the
 * existing application stays a continuation so missing saved source still fails closed.
 */
export function isNewApplicationSpecification(objective: string): boolean {
  return opensWithCreationDirective(objective) && !EXTENDS_EXISTING_PROJECT.test(objective)
    && builderTaskContract(objective).files.length >= 2
}
