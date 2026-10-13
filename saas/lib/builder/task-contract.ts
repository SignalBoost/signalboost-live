import type { BuilderToolTrace } from './contracts.ts'

export type BuilderTaskContract = Readonly<{ files: readonly string[]; commands: readonly string[]; requiresRun: boolean; minimumTests: number }>

const FILE = /^(?:[\w-]+\/)*[\w.-]+\.[a-z0-9]+$/i
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

/** Extract explicit deliverables only; references elsewhere in the request are not output files. */
export function builderTaskContract(objective: string): BuilderTaskContract {
  const files = new Set<string>()
  const commands = new Set<string>()
  let fileList = false
  let runList = false
  for (const raw of objective.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^run(?:\s+(?:these|the following)\s+commands)?\s*:\s*$/i.test(line)) {
      runList = true
      fileList = false
      continue
    }
    if (/^(?:create|write|deliver|provide)(?:\s+(?:these|the|following|files|all))*\s*:\s*$/i.test(line)) {
      fileList = true
      continue
    }
    if (fileList && line) {
      const path = clean(line)
      if (FILE.test(path) && !path.split('/').includes('..')) files.add(path)
      else fileList = false
    }
    for (const inline of line.matchAll(/\b(?:create|write)\s+`?((?:[\w-]+\/)*[\w.-]+\.[a-z0-9]+)\b/gi)) {
      if (FILE.test(inline[1])) files.add(inline[1])
    }
    for (const command of inlineCommands(line)) commands.add(command)
    const command = line.replace(/^\$\s+/, '').replace(/^`|`$/g, '')
    if (runList && /^(?:node|python3?|npm|pnpm|yarn|bun)\s+\S/.test(command) && command.length <= 2_000) commands.add(command)
    else if (line && !/^```/.test(line)) runList = false
  }
  const explicitCount = /\b(?:at least|minimum(?: of)?|all|verify|confirm)\s+(\d+)\s+(?:(?:meaningful|automated|unit|integration|regression)\s+)*tests?\b/i.exec(objective)
  const wordCount = /\b(?:all|verify|confirm)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+tests?\b/i.exec(objective)
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  const minimumTests = explicitCount ? Number(explicitCount[1]) : wordCount ? words[wordCount[1].toLowerCase()] : 0
  return { files: [...files], commands: [...commands], requiresRun: commands.size > 0 || /\b(?:run|execute|test|verify)\b/i.test(objective), minimumTests }
}

export function builderTaskProgress(contract: BuilderTaskContract, paths: readonly string[], trace: readonly BuilderToolTrace[]) {
  const missingFiles = contract.files.filter(path => !paths.includes(path))
  const lastChange = trace.findLastIndex(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  const recent = trace.slice(lastChange + 1).filter(item => item.toolId === 'run')
  const passed = (command: string) => {
    const latest = recent.findLast(item => item.input.command === command || item.input.requestedCommand === command)
    const output = latest?.output as { exitCode?: number; timedOut?: boolean } | undefined
    return latest?.ok === true && output?.exitCode === 0 && output?.timedOut !== true
  }
  const pendingCommands = contract.commands.filter(command => !passed(command))
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
    satisfied: missingFiles.length === 0 && pendingCommands.length === 0 && testsSatisfied && (!contract.requiresRun || hasProof),
  }
}
