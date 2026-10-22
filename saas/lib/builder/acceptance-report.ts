import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import type { BuilderAcceptanceLedger } from './acceptance-ledger.ts'
import type { BuilderFinalProof } from './final-proof.ts'

/** Report computed from host receipts, never invented model narrative. Exactly eleven fields. */
export function builderAcceptanceReport(input: Readonly<{
 jobId: string; files: readonly string[]; receipts: readonly BuilderV2Receipt[];
 ledger: BuilderAcceptanceLedger; proof: BuilderFinalProof;
 publication: Record<string, unknown> | null;
 inferenceBudget: null | { accountedInferenceUsd: number; pendingReservationUsd: number };
 totalElapsedMs: number; failure: string | null;
}>): string {
 const changes = input.receipts.filter(r => r.changed && (r.tool === 'write_file' || r.tool === 'edit_file'))
 const paths = [...new Set(changes.filter(r => r.tool === 'edit_file').map(r =>
   String((r.output as { path?: unknown } | undefined)?.path ?? '')).filter(Boolean))]
 const runs = input.receipts.filter(r => r.tool === 'run_tests')
 const failed = runs.some(r => !r.ok && input.receipts.indexOf(r) < input.ledger.latestSourceChangeIndex)
 const root = failed ? 'Failed addition tests reproduced; source repaired' + (paths.length ? ': ' + paths.join(', ') : '')
   : 'No reproduced initial failure in recorded host evidence'
 const finalRuns = runs.filter(r => input.receipts.indexOf(r) > input.ledger.latestSourceChangeIndex)
 const counts = finalRuns.map(r => {
   const stdout = String((r.output as { stdout?: unknown } | undefined)?.stdout ?? '')
   const pass = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)
   const fail = /(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/.exec(stdout)
   return { pass: pass ? Number(pass[1]) : 0, fail: fail ? Number(fail[1]) : r.ok ? 0 : 1 }
 })
 const best = counts.reduce((a, b) => b.pass > a.pass ? b : a, { pass: 0, fail: 0 })
 const commands = input.ledger.commands.map(c => c.command + ': ' + (c.passed ? 'PASS' : 'FAIL or missing')).join('; ')
 const p = input.publication
 const field = (key: string) => typeof p?.[key] === 'string' ? String(p[key]) : ''
 const repo = field('repository')
 const endpoint = p?.status === 'verified' && p.httpStatus === 200 && input.proof.criteria.endpoint
   ? 'HTTP 200; ' + JSON.stringify(p.responseBody) + '; ' + field('endpointUrl')
   : 'Not verified'
 const cost = input.inferenceBudget ? '$' + input.inferenceBudget.accountedInferenceUsd.toFixed(6) +
   ' USD (pending $' + input.inferenceBudget.pendingReservationUsd.toFixed(6) + ')' : 'Not recorded'
 const verdict = input.proof.passed ? 'PASS' : 'FAIL — ' + (input.failure || input.proof.failureCode || 'missing evidence')
 return [
   'Job ID: ' + input.jobId,
   'Files created/repaired: ' + (input.files.join(', ') || 'None recorded') + (paths.length ? '; repaired: ' + paths.join(', ') : ''),
   'Bug root cause: ' + root,
   'Automated tests: ' + best.pass + ' passed, ' + best.fail + ' failed; ' + (commands || 'no explicit commands'),
   'GitHub repository URL: ' + (repo ? 'https://github.com/' + repo : 'Not published'),
   'Pull request URL: ' + (field('pullRequestUrl') || 'Not created'),
   'Vercel preview URL: ' + (field('previewUrl') || 'Not deployed'),
   'Actual endpoint response: ' + endpoint,
   'Total AI inference cost: ' + cost,
   'Total execution time: ' + (input.totalElapsedMs / 1000).toFixed(1) + ' seconds',
   'Final result: ' + verdict,
 ].join('\n')
}
