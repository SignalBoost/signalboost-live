// saas/lib/builder/certification-fixtures.ts
//
// The submitted work for each Builder certification level, kept out of the route so the fixtures
// are importable and can be graded directly: a ladder whose cases were never proven to fail the
// way their level requires grades nothing.
//
// Objectives are written the way a real user writes them — a named file and an explicit command,
// which is what the coding-objective intake gate requires. They are deliberately small; the ladder
// tests whether the model completes a bounded loop with recorded evidence, not whether it can
// build something large. Seeded files are the supplied broken source for levels 2 and 3; level 1
// starts empty because creation from nothing is the thing being proved.
import type { BuilderCertificationCaseId } from './certification.ts'

type CertificationFixture = Readonly<{
  objective: string
  seed: readonly Readonly<{ path: string; content: string }>[]
}>

/**
 * Fixed objectives, written the way a real user writes them: a named file and an explicit command,
 * which is what the coding-objective gate requires. They are deliberately small — the ladder tests
 * whether the model can complete a bounded loop with evidence, not whether it can build something
 * large. Seeded files are the supplied broken source for levels 2 and 3; level 1 starts empty
 * because creation from nothing is the thing being proved.
 */
export const BUILDER_CERTIFICATION_FIXTURES: Readonly<Record<BuilderCertificationCaseId, CertificationFixture>> = Object.freeze({
  create_and_run_javascript_v1: Object.freeze({
    objective: [
      'Create a file named greeting.js that defines a function greet(name) returning the string',
      '"Hello, <name>!" and prints greet("SignalBoost") when the file is executed.',
      'Run: node greeting.js',
    ].join(' '),
    seed: Object.freeze([]),
  }),

  inspect_repair_and_run_v1: Object.freeze({
    // Phrased as work on a workspace file rather than as a bare "this is broken, fix it" report:
    // the latter is read as a debug request and is refused without an attachment, since a pasted
    // complaint with no source grants no workspace authority. The defect is still discovered by
    // reading and running, not described here.
    objective: [
      'Open the workspace file total.js, correct the loop bound in its total(values) function so',
      'that total([1, 2, 3]) prints 6 instead of NaN, and prove the change.',
      'Run: node total.js',
    ].join(' '),
    // Reads one past the end, so the reduce yields NaN rather than 6: a real defect that a single
    // minimal edit fixes, and that a run visibly proves.
    seed: Object.freeze([Object.freeze({
      path: 'total.js',
      content: [
        'function total(values) {',
        '  let sum = 0',
        '  for (let index = 0; index <= values.length; index += 1) {',
        '    sum += values[index]',
        '  }',
        '  return sum',
        '}',
        '',
        'console.log(total([1, 2, 3]))',
        '',
      ].join('\n'),
    })]),
  }),

  observe_failure_and_recover_v1: Object.freeze({
    objective: [
      'Run: node report.js — it fails. Observe the actual failure, diagnose it from the recorded',
      'output rather than guessing, correct the cause, and prove recovery by running the same',
      'command again until it succeeds and prints the report line.',
    ].join(' '),
    // Requires a module that does not exist in the workspace. The first run fails with a real
    // classified dependency/runtime error, which is exactly the evidence level 3 grades on.
    seed: Object.freeze([Object.freeze({
      path: 'report.js',
      content: [
        "const { formatReport } = require('./format-report.js')",
        '',
        "console.log(formatReport({ title: 'Quarterly', total: 42 }))",
        '',
      ].join('\n'),
    })]),
  }),
})
