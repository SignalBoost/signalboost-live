// saas/lib/builder/verified-task-loop.ts
//
// THE SHARED VERIFIED TASK LOOP (2026-10-26, owner direction: one execution harness for Builder single-file jobs
// and COS chat tool calls). Observe -> act -> verify -> self-correct:
//
//   1. Act: the model writes the complete content of one file it is allowed to change.
//   2. Verify: the verification command runs in the isolated, network-denied Builder sandbox against the workspace
//      with that change. Nothing runs on the platform host.
//   3. Self-correct: a failure's real output (exit code, stderr, stdout) goes back to the model with every earlier
//      attempt, and it tries again.
//   4. Circuit breaker: at most three attempts, and the loop opens early when an attempt fails exactly as the one
//      before it did (the same failure twice is a loop going in circles, not progress).
//
// The workspace is changed only when verification passes; a failing attempt never overwrites the person's source.
// Test files are never editable, so the loop cannot pass by weakening the check. The model is the caller's governed
// Builder model port (the person's own provider under the Builder budget), never a platform key.

import type { BuilderAiPort, BuilderFile, BuilderLoopResult, BuilderRunnerPort, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import { builderFilePath } from './file-chunks.ts'

/** The circuit breaker: attempts before the loop stops and reports the evidence instead of claiming success. */
export const VERIFIED_TASK_MAX_ATTEMPTS = 3
const OUTPUT_LIMIT = 6_000
const MAX_FILE_CHARS = 200_000
const TEST_PATH = /(?:^|\/)(?:.+[._-](?:test|spec)|(?:test|spec)[._-].+)\.[a-z]+$|(?:^|\/)(?:tests?|__tests__)\//i

export type VerifiedTaskAttempt = Readonly<{ attempt: number; path: string | null; exitCode: number | null; timedOut: boolean; log: string }>

export type VerifiedTaskResult = BuilderLoopResult & Readonly<{
  attempts: readonly VerifiedTaskAttempt[]
  stopped: 'verified' | 'circuit_open_max_attempts' | 'circuit_open_repeated_failure' | 'no_usable_output' | 'deadline'
  /** The file the verified attempt wrote; absent when nothing passed. */
  written?: Readonly<{ path: string; content: string }>
}>

export const VERIFIED_TASK_SYSTEM_PROMPT = [
  'You are a code execution agent inside a sandboxed verification loop.',
  'Write the COMPLETE content of exactly one file you are allowed to change, so that the verification command succeeds and the task is done.',
  'Never change, remove or weaken a test or the verification command; make the code meet them.',
  'When an earlier attempt failed, read its real output and fix that cause; do not repeat a failed attempt.',
  'Return ONLY strict JSON: {"path":"one of the allowed paths","content":"the complete file content"}. No markdown, no explanation.',
].join(' ')

const bounded = (value: unknown, max = OUTPUT_LIMIT) => String(value ?? '').slice(0, max)

/** Files the loop may write: the requested ones that exist or are being created, never a test file. */
export function verifiedTaskEditablePaths(paths: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of paths) {
    let path: string
    try { path = builderFilePath(String(raw || '').trim()) } catch { continue }
    if (!TEST_PATH.test(path) && !out.includes(path)) out.push(path)
  }
  return out
}

/** The model's reply: {"path","content"} for an allowed path. Anything else is "no usable output", never a pass. */
export function parseVerifiedTaskEdit(raw: string | null | undefined, editable: readonly string[]): { path: string; content: string } | null {
  const text = String(raw || '').trim().replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { path?: unknown; content?: unknown }
    const path = typeof parsed.path === 'string' ? parsed.path.trim().replace(/\\/g, '/') : ''
    const content = typeof parsed.content === 'string' ? parsed.content : ''
    if (!editable.includes(path) || !content.trim() || content.length > MAX_FILE_CHARS) return null
    return { path, content }
  } catch {
    return null
  }
}

function attemptPrompt(task: string, verifyCommand: string, editable: readonly string[], files: readonly BuilderFile[], history: readonly VerifiedTaskAttempt[], workingKnowledge: string): string {
  const sources = files.map(file => `--- ${file.path}${editable.includes(file.path) ? ' (you may change this file)' : ' (read only)'}\n${bounded(file.content, 20_000)}`).join('\n\n')
  const missing = editable.filter(path => !files.some(file => file.path === path))
  return [
    `TASK:\n${task}`,
    workingKnowledge ? `REFERENCE KNOWLEDGE (how-to context only; never evidence that a check passed):\n${bounded(workingKnowledge, 8_000)}` : '',
    `VERIFICATION COMMAND (runs in the sandbox after your change):\n${verifyCommand}`,
    `ALLOWED PATHS:\n${editable.join('\n')}${missing.length ? `\n(Not created yet: ${missing.join(', ')})` : ''}`,
    sources ? `CURRENT FILES:\n${sources}` : 'CURRENT FILES: none yet.',
    history.length
      ? `EARLIER ATTEMPTS AND THEIR REAL OUTPUT:\n${JSON.stringify(history.map(item => ({ attempt: item.attempt, path: item.path, exitCode: item.exitCode, timedOut: item.timedOut, output: item.log })), null, 2)}`
      : '',
  ].filter(Boolean).join('\n\n')
}

/**
 * Run the loop. The workspace is read for the current files and written only once verification passes.
 */
export async function runVerifiedTaskLoop(input: Readonly<{
  task: string
  workspaceId: string
  verifyCommand: string
  /** Files the model may write (test files are dropped). Others in the workspace are read-only context. */
  editablePaths: readonly string[]
  ports: Readonly<{ ai: BuilderAiPort; runner: BuilderRunnerPort; workspace: BuilderWorkspacePort }>
  /** Shared working-agent knowledge for this job: reference context, never authority or proof. */
  workingKnowledge?: string
  maxAttempts?: number
  deadlineAtMs?: number
  maxTokens?: number
}>): Promise<VerifiedTaskResult> {
  const editable = verifiedTaskEditablePaths(input.editablePaths)
  const maxAttempts = Math.max(1, Math.min(VERIFIED_TASK_MAX_ATTEMPTS, input.maxAttempts ?? VERIFIED_TASK_MAX_ATTEMPTS))
  const trace: BuilderToolTrace[] = []
  const attempts: VerifiedTaskAttempt[] = []
  const finish = (stopped: VerifiedTaskResult['stopped'], error: string): VerifiedTaskResult =>
    ({ ok: false, error, trace, attempts, stopped })
  if (!editable.length || !String(input.verifyCommand || '').trim()) return finish('no_usable_output', 'builder_verified_task_invalid_request')

  const listing = await input.ports.workspace.listFiles(input.workspaceId)
  const workspaceFiles = (await Promise.all(listing.map(item => input.ports.workspace.readFile(input.workspaceId, item.path))))
    .filter((file): file is BuilderFile => Boolean(file))

  // Observe first: when a file the loop may change already exists, run the check before changing anything. A check
  // that already passes needs no model call and no change; a failing one gives attempt 1 the real failure to fix.
  if (editable.some(path => workspaceFiles.some(file => file.path === path))) {
    const first = await input.ports.runner.run({ workspaceId: input.workspaceId, command: input.verifyCommand, files: workspaceFiles })
    const log = bounded([first.stderr, first.stdout].filter(part => String(part || '').trim()).join('\n'))
    trace.push(Object.freeze({
      round: trace.length + 1, toolId: 'run', input: { command: input.verifyCommand, attempt: 0 },
      ok: first.exitCode === 0 && !first.timedOut,
      output: { exitCode: first.exitCode, stdout: bounded(first.stdout), stderr: bounded(first.stderr), timedOut: first.timedOut },
      ...(first.exitCode === 0 && !first.timedOut ? {} : { error: 'builder_verified_task_check_failed' }),
    }))
    if (first.exitCode === 0 && !first.timedOut) {
      return { ok: true, answer: [`\`${input.verifyCommand}\` already exits 0 in the sandbox, so nothing needed to change.`, log ? `Verification output:\n\n\`\`\`\n${log}\n\`\`\`` : ''].filter(Boolean).join('\n\n'), trace, attempts, stopped: 'verified' }
    }
    attempts.push(Object.freeze({ attempt: 0, path: null, exitCode: first.exitCode, timedOut: first.timedOut, log }))
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (input.deadlineAtMs !== undefined && Date.now() >= input.deadlineAtMs) return finish('deadline', 'builder_verified_task_deadline')
    const raw = await input.ports.ai.generate({
      systemPrompt: VERIFIED_TASK_SYSTEM_PROMPT,
      prompt: attemptPrompt(input.task, input.verifyCommand, editable, workspaceFiles, attempts, input.workingKnowledge || ''),
      maxTokens: input.maxTokens ?? 6_000,
    }).catch(() => null)
    const edit = parseVerifiedTaskEdit(raw, editable)
    trace.push(Object.freeze({ round: trace.length + 1, toolId: 'write_file', input: { path: edit?.path ?? null, attempt }, ok: Boolean(edit), ...(edit ? {} : { error: 'builder_verified_task_unusable_output' }) }))
    if (!edit) {
      attempts.push(Object.freeze({ attempt, path: null, exitCode: null, timedOut: false, log: 'The reply was not {"path","content"} JSON for an allowed path, so nothing was run.' }))
      continue
    }
    const candidate = [
      ...workspaceFiles.filter(file => file.path !== edit.path),
      Object.freeze({ path: edit.path, content: edit.content, updatedAt: Date.now() }),
    ]
    const run = await input.ports.runner.run({ workspaceId: input.workspaceId, command: input.verifyCommand, files: candidate })
    const log = bounded([run.stderr, run.stdout].filter(part => String(part || '').trim()).join('\n'))
    trace.push(Object.freeze({
      round: trace.length + 1, toolId: 'run', input: { command: input.verifyCommand, attempt },
      ok: run.exitCode === 0 && !run.timedOut,
      output: { exitCode: run.exitCode, stdout: bounded(run.stdout), stderr: bounded(run.stderr), timedOut: run.timedOut },
      ...(run.exitCode === 0 && !run.timedOut ? {} : { error: 'builder_verified_task_check_failed' }),
    }))
    if (run.exitCode === 0 && !run.timedOut) {
      await input.ports.workspace.writeFile(input.workspaceId, edit.path, edit.content)
      attempts.push(Object.freeze({ attempt, path: edit.path, exitCode: 0, timedOut: false, log }))
      return {
        ok: true,
        answer: [
          `Verified on attempt ${attempt} of ${maxAttempts}: \`${input.verifyCommand}\` exited 0 in the sandbox.`,
          `Changed: ${edit.path}.`,
          log ? `Verification output:\n\n\`\`\`\n${log}\n\`\`\`` : '',
        ].filter(Boolean).join('\n\n'),
        trace, attempts, stopped: 'verified', written: { path: edit.path, content: edit.content },
      }
    }
    const previous = attempts.at(-1)
    attempts.push(Object.freeze({ attempt, path: edit.path, exitCode: run.exitCode, timedOut: run.timedOut, log }))
    if (previous && previous.attempt > 0 && previous.exitCode === run.exitCode && previous.log === log) {
      return finish('circuit_open_repeated_failure', 'builder_verified_task_repeated_failure')
    }
  }
  const usable = attempts.some(item => item.attempt > 0 && item.exitCode !== null)
  return finish(usable ? 'circuit_open_max_attempts' : 'no_usable_output', usable ? 'builder_verified_task_attempts_exhausted' : 'builder_verified_task_unusable_output')
}

/** The person's report for a loop that did not pass: each attempt's real result, never a success claim. */
export function verifiedTaskFailureReport(result: VerifiedTaskResult, verifyCommand: string): string {
  const lines = result.attempts.map(item => item.attempt === 0
    ? `- Before any change: \`${verifyCommand}\` ${item.timedOut ? 'timed out' : `exited ${item.exitCode}`}.`
    : item.exitCode === null
    ? `- Attempt ${item.attempt}: no usable change was produced, so nothing ran.`
    : `- Attempt ${item.attempt}: changed ${item.path}; \`${verifyCommand}\` ${item.timedOut ? 'timed out' : `exited ${item.exitCode}`}.`)
  const why = result.stopped === 'circuit_open_repeated_failure'
    ? 'It stopped early because two attempts failed in exactly the same way.'
    : result.stopped === 'deadline'
      ? 'It stopped because the job ran out of time.'
      : `It stopped after ${result.attempts.filter(item => item.attempt > 0).length} attempts without a passing check.`
  const last = [...result.attempts].reverse().find(item => item.log)
  return [
    `The check did not pass, so your files were left unchanged. ${why}`,
    lines.join('\n'),
    last ? `Last real output:\n\n\`\`\`\n${last.log}\n\`\`\`` : '',
  ].filter(Boolean).join('\n\n')
}
