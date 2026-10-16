// saas/lib/builder/syntax-check.ts
// Immediate syntax diagnostics for files Builder writes, as Windsurf Cascade checks generated code right after
// writing it: a broken package.json or a JavaScript syntax error is reported on the write receipt instead of
// surfacing later as a failed test run. Compile-only: nothing is executed.
import { Script } from 'node:vm'

/** The first syntax error in `content`, as `path:line message`, or null when it parses or is not checked. */
export function builderSyntaxError(path: string, content: string): string | null {
  if (/\.json$/i.test(path)) {
    try { JSON.parse(content); return null } catch (error) {
      return `${path}: ${error instanceof Error ? error.message : 'invalid JSON'}`
    }
  }
  if (!/\.(?:c?js)$/i.test(path)) return null
  // ES module syntax cannot be compiled as a script; those files are left to the real command run.
  if (!/\.cjs$/i.test(path) && /^\s*(?:import\s[^(]|export\s)/m.test(content)) return null
  const source = content.replace(/^#!.*/, '')
  try {
    // The CommonJS wrapper keeps line numbers (it adds no line) and allows top-level return, like Node's loader.
    new Script(`(function (exports, require, module, __filename, __dirname) {${source}\n})`, { filename: path })
    return null
  } catch (error) {
    const line = error instanceof Error ? new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`).exec(error.stack ?? '')?.[1] : undefined
    return `${path}${line ? `:${line}` : ''}: ${error instanceof Error ? error.message : 'syntax error'}`
  }
}
