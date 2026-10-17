// saas/lib/builder/interface-mismatches.ts
/**
 * Deterministic test-to-source interface check for Builder V2 CommonJS projects.
 *
 * A multi-file build writes sources and tests in separate model replies, so a test can import a name
 * (`createCatalog`) or call a method (`catalog.addProduct`) that the source never defined. Running the
 * suite reveals these one stack trace at a time; this check lists every one at once, from the files
 * themselves, so a single repair reply can reconcile them. It reports facts about the workspace only:
 * acceptance still comes from host-run commands.
 */
import type { BuilderWorkspacePort } from './contracts.ts'

export type BuilderInterfaceMismatch = {
  test: string
  line: number
  module: string
  name: string
  kind: 'missing_export' | 'missing_method'
  /** For missing_export: what the module exports. For missing_method: the class and its methods. */
  available: string[]
}

export type BuilderModuleInterface = {
  module: string
  exports: string[]
  /** Exported class name -> its method names. */
  classes: Record<string, string[]>
  /** Exported factory name -> the exported class it returns (`function createCart() { return new Cart() }`). */
  factories: Record<string, string>
  /** The exact `module.exports = ...` statement text, so an edit_file search can target it without a read. */
  exportStatement: string | null
}

/** Mismatches grouped by the source module that has to change, for a single repair reply. */
export type BuilderInterfaceRepair = {
  module: string
  exportStatement: string | null
  exports: string[]
  missing: Array<{ name: string; kind: BuilderInterfaceMismatch['kind']; usedAt: string }>
}

const MAX_FILES = 40
const MAX_SOURCE = 60_000
const MAX_MISMATCHES = 40
const IDENT = '[A-Za-z_$][\\w$]*'
const TEST_PATH = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?js$/

const lineOf = (code: string, index: number) => code.slice(0, index).split('\n').length

/** Body of the balanced `{...}` that starts at `open`, or null. Strings and comments are skipped. */
function braceBody(code: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === '\\') i++
      continue
    }
    if (ch === '/' && code[i + 1] === '/') { i = code.indexOf('\n', i); if (i < 0) return null; continue }
    if (ch === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i + 2); if (i < 0) return null; i++; continue }
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return code.slice(open + 1, i)
  }
  return null
}

/** Top-level keys of an object-literal body (`A, B: x, c() {}, ...rest` → A, B, c). */
function objectKeys(body: string): string[] {
  const keys: string[] = []
  let depth = 0, start = 0
  const parts: string[] = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1 }
  }
  parts.push(body.slice(start))
  for (const part of parts) {
    const key = new RegExp(`^\\s*(?:async\\s+)?(?:get\\s+|set\\s+)?['"]?(${IDENT})['"]?\\s*(?:[:(,]|$)`).exec(part.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))
    if (key && key[1] !== '...') keys.push(key[1])
  }
  return keys
}

function classMethods(code: string, name: string): string[] | null {
  const head = new RegExp(`\\bclass\\s+${name}\\b[^{]*\\{`).exec(code)
  if (!head) return null
  const body = braceBody(code, head.index + head[0].length - 1)
  if (body === null) return null
  // Members at the top level of the class body only.
  const methods = new Set<string>()
  let depth = 0
  for (const line of body.split('\n')) {
    if (depth === 0) {
      const member = new RegExp(`^\\s*(?:static\\s+)?(?:async\\s+)?(?:get\\s+|set\\s+)?\\*?\\s*(#?${IDENT})\\s*\\(`).exec(line)
      if (member && !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'function', 'return'].includes(member[1])) methods.add(member[1])
      const field = new RegExp(`^\\s*(?:static\\s+)?(${IDENT})\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${IDENT})\\s*=>`).exec(line)
      if (field) methods.add(field[1])
    }
    for (const ch of line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
  }
  // Inherited methods count as available.
  const parent = new RegExp(`\\bclass\\s+${name}\\s+extends\\s+(${IDENT})`).exec(code)?.[1]
  if (parent && parent !== name) {
    // A parent defined in another file is not visible here: its methods are unknown, so report none missing.
    const inherited = classMethods(code, parent)
    if (!inherited) return null
    for (const method of inherited) methods.add(method)
  }
  return [...methods].filter(method => !method.startsWith('#'))
}

/** What a CommonJS source module exports, and the methods of the classes it exports. */
export function builderModuleInterface(module: string, code: string): BuilderModuleInterface | null {
  const exports = new Set<string>()
  let single: string | null = null
  let exportStatement: string | null = null
  for (const found of code.matchAll(/\bmodule\.exports\s*=\s*/g)) {
    const at = found.index! + found[0].length
    if (code[at] === '{') {
      const body = braceBody(code, at)
      if (body !== null) for (const key of objectKeys(body)) exports.add(key)
      if (body !== null) exportStatement = code.slice(found.index!, at + body.length + 2).slice(0, 600)
    } else {
      exportStatement = code.slice(found.index!).split('\n')[0].slice(0, 600)
      single = new RegExp(`^(?:new\\s+)?(${IDENT})`).exec(code.slice(at))?.[1] ?? null
    }
  }
  for (const found of code.matchAll(new RegExp(`\\b(?:module\\.)?exports\\.(${IDENT})\\s*=`, 'g'))) exports.add(found[1])
  // `module.exports = Cart` exposes Cart's static members and is the value itself; property imports read statics.
  if (single && !exports.size) {
    const statics = [...code.matchAll(new RegExp(`\\b${single}\\.(${IDENT})\\s*=`, 'g'))].map(found => found[1])
    const staticMembers = [...code.matchAll(new RegExp(`\\bstatic\\s+(?:async\\s+)?(${IDENT})\\s*[=(]`, 'g'))].map(found => found[1])
    for (const name of [...statics, ...staticMembers]) exports.add(name)
  }
  if (!exports.size && !single) return null
  const classes: Record<string, string[]> = {}
  for (const name of [...exports, ...(single ? [single] : [])]) {
    const binding = new RegExp(`\\b${name}\\s*:\\s*(${IDENT})`).exec(code)?.[1] ?? name
    const methods = classMethods(code, binding)
    if (methods) classes[name] = methods
  }
  const factories: Record<string, string> = {}
  for (const name of exports) {
    if (classes[name]) continue
    const binding = new RegExp(`\\b${name}\\s*:\\s*(${IDENT})`).exec(code)?.[1] ?? name
    const head = new RegExp(`\\bfunction\\s+${binding}\\s*\\([^)]*\\)\\s*\\{|\\b(?:const|let|var)\\s+${binding}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\([^)]*\\)\\s*(?:=>\\s*)?`).exec(code)
    if (!head) continue
    const rest = code.slice(head.index + head[0].length)
    const body = rest.startsWith('{') ? braceBody(rest, 0) : head[0].endsWith('{') ? braceBody(code, head.index + head[0].length - 1) : rest.split('\n')[0]
    const created = body ? new RegExp(`\\bnew\\s+(${IDENT})\\s*\\(`).exec(body)?.[1] : undefined
    const exported = created ? Object.keys(classes).find(key => key === created || new RegExp(`\\b${key}\\s*:\\s*${created}\\b`).test(code)) : undefined
    if (exported) factories[name] = exported
  }
  return { module, exports: [...exports], classes, factories, exportStatement }
}

/** Resolve `../src/cart` (from test/x.test.js) to a known workspace path. */
function resolveImport(fromPath: string, spec: string, known: ReadonlySet<string>): string | null {
  if (!spec.startsWith('.')) return null
  const parts = fromPath.split('/').slice(0, -1)
  for (const piece of spec.split('/')) {
    if (piece === '..') parts.pop()
    else if (piece !== '.' && piece) parts.push(piece)
  }
  const base = parts.join('/')
  for (const candidate of [base, `${base}.js`, `${base}.cjs`, `${base}/index.js`]) if (known.has(candidate)) return candidate
  return null
}

/**
 * Every place a test uses a name its imported source module does not provide: destructured or property
 * imports missing from module.exports, and methods called on `new Class()` instances the class lacks.
 */
export function builderInterfaceMismatches(files: ReadonlyArray<{ path: string; content: string }>): BuilderInterfaceMismatch[] {
  const known = new Set(files.map(file => file.path))
  const interfaces = new Map<string, BuilderModuleInterface | null>()
  const moduleInterface = (path: string) => {
    if (!interfaces.has(path)) {
      const source = files.find(file => file.path === path)
      interfaces.set(path, source ? builderModuleInterface(path, source.content.slice(0, MAX_SOURCE)) : null)
    }
    return interfaces.get(path) ?? null
  }
  const mismatches: BuilderInterfaceMismatch[] = []
  const seen = new Set<string>()
  const add = (mismatch: BuilderInterfaceMismatch) => {
    const key = `${mismatch.test}|${mismatch.module}|${mismatch.kind}|${mismatch.name}`
    if (seen.has(key) || mismatches.length >= MAX_MISMATCHES) return
    seen.add(key)
    mismatches.push(mismatch)
  }
  for (const test of files) {
    if (!TEST_PATH.test(test.path) || !/\.[cm]?js$/.test(test.path)) continue
    const code = test.content.slice(0, MAX_SOURCE)
    // Local name -> { module, exported name } for imported bindings.
    const bindings = new Map<string, { module: string; name: string }>()
    const requireCall = `require\\(\\s*['"](\\.{1,2}\\/[^'"]+)['"]\\s*\\)`
    for (const found of code.matchAll(new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${requireCall}`, 'g'))) {
      const module = resolveImport(test.path, found[2], known)
      const api = module ? moduleInterface(module) : null
      if (!module || !api) continue
      for (const entry of found[1].split(',')) {
        const parsed = new RegExp(`^\\s*(${IDENT})\\s*(?::\\s*(${IDENT}))?\\s*(?:=.*)?$`).exec(entry)
        if (!parsed) continue
        bindings.set(parsed[2] ?? parsed[1], { module, name: parsed[1] })
        if (!api.exports.includes(parsed[1])) {
          add({ test: test.path, line: lineOf(code, found.index!), module, name: parsed[1], kind: 'missing_export', available: api.exports })
        }
      }
    }
    // const mod = require('../src/x'); mod.createThing(...)
    for (const found of code.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*${requireCall}`, 'g'))) {
      const module = resolveImport(test.path, found[2], known)
      const api = module ? moduleInterface(module) : null
      if (!module || !api || !api.exports.length) continue
      for (const use of code.matchAll(new RegExp(`\\b${found[1]}\\.(${IDENT})\\b`, 'g'))) {
        bindings.set(`${found[1]}.${use[1]}`, { module, name: use[1] })
        if (!api.exports.includes(use[1])) add({ test: test.path, line: lineOf(code, use.index!), module, name: use[1], kind: 'missing_export', available: api.exports })
      }
    }
    // const cart = new Cart(...) or createCart(...); cart.addItem(...) — only for classes the module really
    // exports and factories that visibly return one.
    for (const found of code.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(new\\s+)?(${IDENT}(?:\\.${IDENT})?)\\s*\\(`, 'g'))) {
      const binding = bindings.get(found[3])
      const api = binding ? moduleInterface(binding.module) : null
      const className = binding && api ? (found[2] ? binding.name : api.factories[binding.name]) : undefined
      const methods = className && api ? api.classes[className] : undefined
      if (!binding || !className || !methods) continue
      for (const call of code.matchAll(new RegExp(`\\b${found[1]}\\.(${IDENT})\\s*\\(`, 'g'))) {
        if (!methods.includes(call[1])) {
          add({ test: test.path, line: lineOf(code, call.index!), module: binding.module, name: `${className}.prototype.${call[1]}`, kind: 'missing_method', available: methods })
        }
      }
    }
  }
  return mismatches
}

/** Group mismatches by the module to change, carrying its exact export statement. */
export function builderInterfaceRepairs(
  mismatches: readonly BuilderInterfaceMismatch[],
  files: ReadonlyArray<{ path: string; content: string }>,
): BuilderInterfaceRepair[] {
  const repairs = new Map<string, BuilderInterfaceRepair>()
  for (const mismatch of mismatches) {
    let repair = repairs.get(mismatch.module)
    if (!repair) {
      const source = files.find(file => file.path === mismatch.module)
      const api = source ? builderModuleInterface(mismatch.module, source.content.slice(0, MAX_SOURCE)) : null
      repair = { module: mismatch.module, exportStatement: api?.exportStatement ?? null, exports: api?.exports ?? [], missing: [] }
      repairs.set(mismatch.module, repair)
    }
    if (!repair.missing.some(item => item.name === mismatch.name)) {
      repair.missing.push({ name: mismatch.name, kind: mismatch.kind, usedAt: `${mismatch.test}:${mismatch.line}` })
    }
  }
  return [...repairs.values()]
}

async function readJavaScript(workspace: BuilderWorkspacePort, workspaceId: string, knownPaths: readonly string[]) {
  const paths = knownPaths.filter(path => /\.[cm]?js$/.test(path) && !path.startsWith('node_modules/')).slice(0, MAX_FILES)
  const files = await Promise.all(paths.map(async path => {
    const file = await workspace.readFile(workspaceId, path)
    return file ? { path, content: file.content } : null
  }))
  return files.filter((file): file is { path: string; content: string } => Boolean(file))
}

/** The interface check over the workspace's JavaScript sources and tests, grouped by module to change. */
export async function builderWorkspaceInterfaceRepairs(
  workspace: BuilderWorkspacePort | undefined,
  workspaceId: string,
  knownPaths: readonly string[],
): Promise<BuilderInterfaceRepair[]> {
  if (!workspace) return []
  const files = await readJavaScript(workspace, workspaceId, knownPaths)
  return builderInterfaceRepairs(builderInterfaceMismatches(files), files)
}

/** The exported interface of the workspace's non-test sources, so tests written later use real names. */
export async function builderWorkspaceModuleInterfaces(
  workspace: BuilderWorkspacePort | undefined,
  workspaceId: string,
  knownPaths: readonly string[],
): Promise<Array<{ module: string; exports: string[]; classes: Record<string, string[]>; factories: Record<string, string> }>> {
  if (!workspace) return []
  const files = await readJavaScript(workspace, workspaceId, knownPaths.filter(path => !TEST_PATH.test(path)))
  return files.map(file => builderModuleInterface(file.path, file.content.slice(0, MAX_SOURCE)))
    .filter((api): api is BuilderModuleInterface => Boolean(api))
    .map(({ module, exports, classes, factories }) => ({ module, exports, classes, factories }))
}
