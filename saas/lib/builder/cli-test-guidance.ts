/** Test-generation requirements; these do not manufacture execution evidence. */
export function formatBuilderCliTestGuidance(objective: string): string {
  if (!/\b(?:CLI|command[- ]line)\b/i.test(objective) || !/\b(?:test|tests|verify|verification)\b/i.test(objective)) return ''
  return [
    'CLI PROCESS CONTRACT: Library-level assert.throws tests do not prove executable behavior. Include process-level automated tests that launch the actual CLI in addition to unit tests.',
    'For Node.js use spawnSync(process.execPath, [absoluteCliPath, ...args], { encoding: "utf8", timeout: 10000 }) with an absolute CLI path resolved relative to the test file. Use the equivalent process API for other runtimes. Do not interpolate user input into shell commands.',
    'Assert no spawn error, signal === null, and an integer status before checking exit codes; null is not a valid expected nonzero exit. A timeout or failed launch must fail the test.',
    'Cover valid input (exit 0, expected parsed stdout, empty stderr), every required invalid-input class (nonzero exit, specific error on stderr, no successful report on stdout), missing files/arguments and invalid options where applicable, and both supported filter/option forms. Keep data edge-case and exact-arithmetic assertions.',
    'Create unique temporary directories, register per-test cleanup with t.after before writing fixtures, and remove directories recursively after the test. Check missing-file behavior with an absent path inside that unique directory, not a shared guessed filename.',
    'Never replace executable tests with library-only tests to get green. Run the entire requested suite and sample after changes. Generate README example output from the verified sample command; compare field names, types, values and units rather than calculating or inventing a separate example. Do not claim process-level coverage merely because this guidance was supplied.',
  ].join('\n')
}
