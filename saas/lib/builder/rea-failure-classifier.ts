// Deterministic failure taxonomy for Builder's error-to-repair harness.
// Uses observed execution output only; it never authorizes edits or claims success.
export type BuilderRepairSignal = Readonly<{
  kind: 'module_resolution' | 'syntax' | 'assertion' | 'runtime' | 'unknown'
  action: string
}>
export function classifyBuilderFailure(output: string): BuilderRepairSignal {
 const log = String(output || '').slice(-12000)
 if (/(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module|Cannot resolve module|Module not found)/i.test(log))
  return {kind:'module_resolution',action:'Locate the missing import and its package or local file. Check the existing dependency manifest and import path; repair only the missing dependency or path, then rerun the failed command.'}
 if (/(?:SyntaxError:|Unexpected token|Unexpected end of input|Parsing error:)/i.test(log))
  return {kind:'syntax',action:'Inspect the file and line referenced in the syntax error, correct the smallest invalid construct, and rerun the exact failed command.'}
 if (/(?:AssertionError|ERR_ASSERTION|Expected .* (?:to |but )|\b(?:FAIL|not ok)\b)/i.test(log))
  return {kind:'assertion',action:'Read the failing assertion and actual-versus-expected output, inspect the implicated implementation, and fix behavior without weakening the test. Rerun the focused assertion, then the original suite.'}
 if (/(?:TypeError:|ReferenceError:|RangeError:|UnhandledPromiseRejection|uncaught exception)/i.test(log))
  return {kind:'runtime',action:'Use the observed stack location to trace the failing runtime call, add a minimal source fix, and rerun the original command.'}
 return {kind:'unknown',action:'Use the actual failing exit status, stderr and stdout to identify one concrete reproduction before changing source. Do not guess a fix.'}
}
