//
// Teaches `node --test` the one thing it does not know about this repo: the `@/` path alias.
//
// tsconfig maps `@/*` to `./*` from the saas root, and Next/Turbopack honour it. Node's ESM
// resolver reads no tsconfig, so any module reaching an `@/…` specifier dies at load with
// ERR_MODULE_NOT_FOUND — usually several levels below the test file, which makes it look like a
// broken test rather than a resolver gap. That kept a group of otherwise passing suites out of
// CI entirely.
//
// This is a TEST-ONLY resolve hook. It changes nothing about the production build, which never
// loads it: `next build` resolves `@/` through tsconfig as it always has. The hook only fills
// in what tsconfig already declares, so it cannot make an import work that would fail in the
// real build.
//
// Loaded via `node --import ./scripts/test-alias-loader.mjs --test …` in the `test` script.

import { registerHooks } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The saas/ directory — the root that `@/` resolves against, exactly as tsconfig has it. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

function isFile(candidate) {
  try { return existsSync(candidate) && statSync(candidate).isFile() } catch { return false }
}

/** Mirrors TypeScript's own resolution order for an extensionless specifier. */
function resolveAlias(specifier) {
  const base = resolve(ROOT, specifier.slice(2))
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]) {
    if (isFile(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = resolveAlias(specifier)
      // Fall through when nothing matches, so a genuinely broken alias still reports the
      // original specifier rather than a confusing rewritten one.
      if (resolved) return nextResolve(resolved, context)
    }
    return nextResolve(specifier, context)
  },
})
