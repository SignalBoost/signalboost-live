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
  kind: 'missing_export' | 'missing_method' | 'wrong_argument_count' | 'method_not_chainable' | 'mutates_defensive_copy'
  /**
   * missing_export: what the module exports. missing_method: the class's methods.
   * wrong_argument_count: the declared parameters. method_not_chainable: the method's return statements.
   * mutates_defensive_copy: the getter's module and line, so the fix can land on either side.
   */
  available: string[]
}

/** Declared parameters of a constructor or factory; `required` counts those without a default or rest. */
export type BuilderSignature = { params: string[]; required: number; rest: boolean }

export type BuilderModuleInterface = {
  module: string
  exports: string[]
  /** Exported class name -> its method names. */
  classes: Record<string, string[]>
  /** Exported factory name -> the exported class it returns (`function createCart() { return new Cart() }`). */
  factories: Record<string, string>
  /** The exact `module.exports = ...` statement text, so an edit_file search can target it without a read. */
  exportStatement: string | null
  /** Exported class or factory name -> its constructor/function parameters; `Class.prototype.method` -> the method's. */
  signatures: Record<string, BuilderSignature>
  /** Exported class name -> methods whose body returns `this`, so `new X().m()` can be chained. */
  chainable: Record<string, string[]>
  /** The value of `module.exports = Name` when the module exports one binding directly. */
  defaultExport: string | null
  /** Exported class name -> methods that return a copy (`return { ...stored }`), so callers cannot mutate state through them. */
  copyReturning: Record<string, Array<{ method: string; line: number }>>
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

/** Split a parenthesised list at top-level commas, skipping strings, comments and nested brackets. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < list.length && list[i] !== ch; i++) if (list[i] === '\\') i++
      continue
    }
    // A comma inside a comment is prose, not a separator (Codex on #4689).
    if (ch === '/' && list[i + 1] === '/') { const end = list.indexOf('\n', i); if (end < 0) break; i = end; continue }
    if (ch === '/' && list[i + 1] === '*') { const end = list.indexOf('*/', i + 2); if (end < 0) break; i = end + 1; continue }
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    else if (ch === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1 }
  }
  parts.push(list.slice(start))
  return parts.map(part => part.trim()).filter(Boolean)
}

/** The `(...)` that starts at `open`, or null; returns the text between the parentheses. */
function parenBody(code: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === '\\') i++
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return code.slice(open + 1, i)
  }
  return null
}

function signatureOf(paramList: string): BuilderSignature {
  const params = splitTopLevel(paramList)
  const rest = params.some(param => param.startsWith('...'))
  let required = 0
  for (const param of params) {
    if (param.startsWith('...') || /=/.test(param.replace(/\{[^}]*\}|\[[^\]]*\]/g, ''))) break
    required++
  }
  return { params, required, rest }
}

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

type ClassDetails = { methods: string[]; chainable: string[]; constructor: BuilderSignature | null; methodSignatures: Record<string, BuilderSignature>; copyReturning: Array<{ method: string; line: number }> }

function classDetails(code: string, name: string): ClassDetails | null {
  const head = new RegExp(`\\bclass\\s+${name}\\b[^{]*\\{`).exec(code)
  if (!head) return null
  const bodyStart = head.index + head[0].length - 1
  const body = braceBody(code, bodyStart)
  if (body === null) return null
  // Members at the top level of the class body only.
  const methods = new Set<string>()
  const chainable = new Set<string>()
  const methodSignatures: Record<string, BuilderSignature> = {}
  const copyReturning: Array<{ method: string; line: number }> = []
  let constructorSignature: BuilderSignature | null = null
  let depth = 0, offset = 0
  for (const line of body.split('\n')) {
    if (depth === 0) {
      const member = new RegExp(`^\\s*(?:static\\s+)?(?:async\\s+)?(?:get\\s+|set\\s+)?\\*?\\s*(#?${IDENT})\\s*\\(`).exec(line)
      if (member && !['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(member[1])) {
        const parenAt = offset + member[0].length - 1
        const params = parenBody(body, parenAt)
        const braceAt = params === null ? -1 : body.indexOf('{', parenAt + params.length + 2)
        const methodBody = braceAt < 0 ? null : braceBody(body, braceAt)
        if (member[1] === 'constructor') constructorSignature = signatureOf(params ?? '')
        else {
          methods.add(member[1])
          if (params !== null) methodSignatures[member[1]] = signatureOf(params)
          if (methodBody !== null && /\breturn\s+this\b(?![.\[(])/.test(methodBody)) chainable.add(member[1])
          // A getter that hands out a copy of stored state: `return { ...product }`, `Object.assign({}, product)`,
          // `structuredClone(product)`, `JSON.parse(JSON.stringify(product))`.
          const copy = methodBody === null ? null : /\breturn\s+(?:\{\s*\.\.\.|Object\.assign\(\s*\{\s*\}|structuredClone\(|JSON\.parse\(\s*JSON\.stringify\()/.exec(methodBody)
          if (copy) copyReturning.push({ method: member[1], line: lineOf(code, bodyStart + 1 + offset) + lineOf(methodBody, copy.index) - 1 })
        }
      }
      const field = new RegExp(`^\\s*(?:static\\s+)?(${IDENT})\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|${IDENT})\\s*=>`).exec(line)
      if (field) methods.add(field[1])
    }
    for (const ch of line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    offset += line.length + 1
  }
  // Inherited methods count as available.
  const parent = new RegExp(`\\bclass\\s+${name}\\s+extends\\s+(${IDENT})`).exec(code)?.[1]
  if (parent && parent !== name) {
    // A parent defined in another file is not visible here: its methods are unknown, so report none missing.
    const inherited = classDetails(code, parent)
    if (!inherited) return null
    for (const method of inherited.methods) methods.add(method)
    for (const method of inherited.chainable) chainable.add(method)
    for (const [method, signature] of Object.entries(inherited.methodSignatures)) if (!methodSignatures[method]) methodSignatures[method] = signature
    if (!constructorSignature) constructorSignature = inherited.constructor
  }
  return { methods: [...methods].filter(method => !method.startsWith('#')), chainable: [...chainable], constructor: constructorSignature, methodSignatures, copyReturning }
}

function classMethods(code: string, name: string): string[] | null {
  return classDetails(code, name)?.methods ?? null
}

/**
 * Members of the object literal a function body returns at its top level: `return { a: function (x) {}, b(y) {},
 * c: (z) => {} }`. Returns null when the body does not end in an object literal.
 */
function objectLiteralMembers(body: string): Omit<ClassDetails, 'constructor'> | null {
  // A concise arrow body `({ ... })` is the literal itself.
  const concise = /^\s*\(\s*\{/.exec(body)
  if (concise) return literalMembers(body, concise[0].length - 1)
  // The last top-level `return {` of the body.
  let depth = 0, at = -1
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < body.length && body[i] !== ch; i++) if (body[i] === '\\') i++
      continue
    }
    if (ch === '{') { if (depth === 0 && /\breturn\s*$/.test(body.slice(Math.max(0, i - 12), i))) at = i; depth++ }
    else if (ch === '}') depth--
  }
  if (at < 0) return null
  return literalMembers(body, at)
}

function literalMembers(body: string, at: number): Omit<ClassDetails, 'constructor'> | null {
  const literal = braceBody(body, at)
  if (literal === null) return null
  const methods: string[] = [], chainable: string[] = [], copyReturning: Array<{ method: string; line: number }> = []
  const methodSignatures: Record<string, BuilderSignature> = {}
  for (const raw of splitTopLevel(literal)) {
    // Leading comments belong to the member that follows them.
    const entry = raw.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, '')
    // `a: function (x) {`, `b(y) {`, `c: (z) => {`, `d: (z) => expr`, `e: async (z) => {`
    const member = new RegExp(`^(?:async\\s+)?(${IDENT})\\s*(?::\\s*(?:async\\s*)?(?:function\\s*)?)?\\(([^)]*)\\)\\s*(=>)?\\s*(\\{)?`).exec(entry)
    if (!member || (!member[3] && !member[4])) continue
    methods.push(member[1])
    methodSignatures[member[1]] = signatureOf(member[2])
    if (!member[4]) continue
    const methodBody = braceBody(entry, member[0].length - 1)
    if (methodBody === null) continue
    if (/\breturn\s+this\b(?![.\[(])/.test(methodBody)) chainable.push(member[1])
    const copy = /\breturn\s+(?:\{\s*\.\.\.|Object\.assign\(\s*\{\s*\}|structuredClone\(|JSON\.parse\(\s*JSON\.stringify\()/.exec(methodBody)
    if (copy) copyReturning.push({ method: member[1], line: lineOf(body, at) + lineOf(literal, literal.indexOf(raw) + raw.indexOf(entry)) - 1 + lineOf(methodBody, copy.index) - 1 })
  }
  return { methods, chainable, copyReturning, methodSignatures }
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
  const chainable: Record<string, string[]> = {}
  const copyReturning: Record<string, Array<{ method: string; line: number }>> = {}
  const signatures: Record<string, BuilderSignature> = {}
  for (const name of [...exports, ...(single ? [single] : [])]) {
    const binding = new RegExp(`\\b${name}\\s*:\\s*(${IDENT})`).exec(code)?.[1] ?? name
    const details = classDetails(code, binding)
    if (!details) continue
    classes[name] = details.methods
    if (details.chainable.length) chainable[name] = details.chainable
    if (details.copyReturning.length) copyReturning[name] = details.copyReturning
    // A class without a constructor accepts any arguments.
    if (details.constructor) signatures[name] = details.constructor
    for (const [method, signature] of Object.entries(details.methodSignatures)) signatures[`${name}.prototype.${method}`] = signature
  }
  const factories: Record<string, string> = {}
  for (const name of exports) {
    if (classes[name]) continue
    // `exports.Name = class ... {}`: an anonymous class bound to the export name.
    const exportedClass = new RegExp(`\\b(?:module\\.)?exports\\.${name}\\s*=\\s*class\\b`).exec(code)
    if (exportedClass) {
      const details = classDetails(code.replace(exportedClass[0], `${exportedClass[0].replace(/class\b$/, '')}class ${name}`), name)
      if (details) {
        classes[name] = details.methods
        if (details.chainable.length) chainable[name] = details.chainable
        if (details.copyReturning.length) copyReturning[name] = details.copyReturning
        if (details.constructor) signatures[name] = details.constructor
        for (const [method, signature] of Object.entries(details.methodSignatures)) signatures[`${name}.prototype.${method}`] = signature
      }
      continue
    }
    const binding = new RegExp(`\\b${name}\\s*:\\s*(${IDENT})`).exec(code)?.[1] ?? name
    // function f(params) {   |   const f = (params) => / function (params) {   |   exports.f = function (params) { / (params) => {
    const head = new RegExp(`\\bfunction\\s+${binding}\\s*\\(([^)]*)\\)\\s*\\{|\\b(?:(?:const|let|var)\\s+|(?:module\\.)?exports\\.)${binding}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\(([^)]*)\\)\\s*(?:=>\\s*)?`).exec(code)
    if (!head) continue
    signatures[name] = signatureOf(head[1] ?? head[2] ?? '')
    const rest = code.slice(head.index + head[0].length)
    const conciseLiteral = /^\s*\(\s*\{/.test(rest) ? parenBody(rest, rest.indexOf('(')) : null
    const body = rest.startsWith('{') ? braceBody(rest, 0) : head[0].endsWith('{') ? braceBody(code, head.index + head[0].length - 1)
      : conciseLiteral !== null ? `(${conciseLiteral})` : rest.split('\n')[0]
    const created = body ? new RegExp(`\\bnew\\s+(${IDENT})\\s*\\(`).exec(body)?.[1] : undefined
    const exported = created ? Object.keys(classes).find(key => key === created || new RegExp(`\\b${key}\\s*:\\s*${created}\\b`).test(code)) : undefined
    if (exported) { factories[name] = exported; continue }
    // A factory returning an object literal (`return { add: function () {}, total() {} }`) is the class of what it
    // returns: its methods, signatures and copy-returning getters are recorded under the factory's own name.
    const literal = body ? objectLiteralMembers(body) : null
    if (literal && literal.methods.length) {
      classes[name] = literal.methods
      factories[name] = name
      if (literal.chainable.length) chainable[name] = literal.chainable
      if (literal.copyReturning.length) copyReturning[name] = literal.copyReturning.map(item => ({ method: item.method, line: lineOf(code, head.index) + item.line - 1 }))
      for (const [method, signature] of Object.entries(literal.methodSignatures)) signatures[`${name}.prototype.${method}`] = signature
    }
  }
  return { module, exports: [...exports], classes, factories, exportStatement, signatures, chainable, defaultExport: single, copyReturning }
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

/** Text from `from` to the end of the innermost enclosing `{...}` block (exclusive of that brace). */
function enclosingBlock(code: string, from: number): string {
  let depth = 0
  for (let i = from; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === '\\') i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') { if (depth === 0) return code.slice(from, i); depth-- }
  }
  return code.slice(from)
}

/**
 * For a class, which of its `this.<field>` members hold an instance of a known class: the field is assigned from
 * a constructor parameter, and a test constructs the class passing `new Known(...)`/`createKnown(...)` (bound through
 * its requires) at that parameter's position. Evidence from the workspace, not an assumption about the field name.
 */
function injectedFieldClasses(
  className: string, code: string,
  files: ReadonlyArray<{ path: string; content: string }>, known: ReadonlySet<string>,
  moduleInterface: (path: string) => BuilderModuleInterface | null,
): Map<string, { module: string; className: string }> {
  const result = new Map<string, { module: string; className: string }>()
  const selfApi = builderModuleInterface('', code)
  const head = new RegExp(`\\bclass\\s+${className}\\b[^{]*\\{`).exec(code)
  const body = head ? braceBody(code, head.index + head[0].length - 1) : null
  const ctor = body ? /\bconstructor\s*\(/.exec(body) : null
  if (!body || !ctor) return result
  const params = parenBody(body, ctor.index + ctor[0].length - 1)
  const ctorBody = params === null ? null : braceBody(body, body.indexOf('{', ctor.index + ctor[0].length + params.length))
  if (params === null || ctorBody === null) return result
  const names = splitTopLevel(params).map(param => param.replace(/=.*$/, '').replace(/^\.\.\./, '').trim())
  // field -> parameter index
  const fieldParam = new Map<string, number>()
  for (const found of ctorBody.matchAll(new RegExp(`\\bthis\\.(${IDENT})\\s*=\\s*(${IDENT})\\s*[;\\n]`, 'g'))) {
    const index = names.indexOf(found[2])
    if (index >= 0) fieldParam.set(found[1], index)
  }
  if (!fieldParam.size) return result
  // parameter index -> class, from how tests construct this class
  const paramClass = new Map<number, { module: string; className: string }>()
  for (const test of files) {
    if (!TEST_PATH.test(test.path) || !/\.[cm]?js$/.test(test.path)) continue
    const testCode = test.content.slice(0, MAX_SOURCE)
    const bindings = new Map<string, { module: string; name: string }>()
    const requireCall = `require\\(\\s*['"](\\.{1,2}\\/[^'"]+)['"]\\s*\\)`
    for (const found of testCode.matchAll(new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${requireCall}`, 'g'))) {
      const module = resolveImport(test.path, found[2], known)
      if (!module) continue
      for (const entry of found[1].split(',')) {
        const parsed = new RegExp(`^\\s*(${IDENT})\\s*(?::\\s*(${IDENT}))?`).exec(entry)
        if (parsed) bindings.set(parsed[2] ?? parsed[1], { module, name: parsed[1] })
      }
    }
    for (const found of testCode.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*${requireCall}`, 'g'))) {
      const module = resolveImport(test.path, found[2], known)
      const api = module ? moduleInterface(module) : null
      if (module && api?.defaultExport && !api.exports.length) bindings.set(found[1], { module, name: api.defaultExport })
    }
    // variable -> class it holds
    const holds = new Map<string, { module: string; className: string }>()
    for (const found of testCode.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(new\\s+)?(${IDENT})\\s*\\(`, 'g'))) {
      const binding = bindings.get(found[3])
      const api = binding ? moduleInterface(binding.module) : null
      const resolved = binding && api ? (found[2] ? (api.classes[binding.name] ? binding.name : undefined) : api.factories[binding.name]) : undefined
      if (resolved) holds.set(found[1], { module: binding!.module, className: resolved })
    }
    // `new Class(a, b)` directly, or through an exported factory of the same module that forwards its parameters
    // (`function createX(catalog) { return new X(catalog) }`): the factory's parameter order maps to the constructor's.
    const constructions: Array<{ callee: string; forward: number[] | null }> = [{ callee: className, forward: null }]
    for (const [factory, target] of Object.entries(selfApi?.factories ?? {})) {
      if (target !== className) continue
      const factoryHead = new RegExp(`\\bfunction\\s+${factory}\\s*\\(([^)]*)\\)\\s*\\{`).exec(code)
      const factoryBody = factoryHead ? braceBody(code, factoryHead.index + factoryHead[0].length - 1) : null
      const forwarded = factoryBody ? new RegExp(`\\bnew\\s+${className}\\s*\\(([^)]*)\\)`).exec(factoryBody) : null
      if (!factoryHead || !forwarded) continue
      const factoryParams = splitTopLevel(factoryHead[1]).map(param => param.replace(/=.*$/, '').trim())
      // forward[ctorIndex] = factory parameter index that reaches it
      const forward = splitTopLevel(forwarded[1]).map(arg => factoryParams.indexOf(arg.trim()))
      constructions.push({ callee: factory, forward })
    }
    for (const { callee, forward } of constructions) {
      const local = [...bindings].find(([, binding]) => binding.name === callee)?.[0] ?? callee
      for (const found of testCode.matchAll(new RegExp(`(?:\\bnew\\s+|(?<![\\w$.]))${local}\\s*\\(`, 'g'))) {
        const args = parenBody(testCode, found.index! + found[0].length - 1)
        if (args === null) continue
        const given = splitTopLevel(args)
        const ctorArgs = forward ? forward.map(index => index >= 0 ? given[index] : undefined) : given
        ctorArgs.forEach((arg, index) => {
          const held = arg ? holds.get(arg) : undefined
          if (held && !paramClass.has(index)) paramClass.set(index, held)
        })
      }
    }
  }
  for (const [field, index] of fieldParam) {
    const held = paramClass.get(index)
    if (held) result.set(field, held)
  }
  return result
}

/**
 * For an argument starting at `at`, the lower-cased declared parameter name at that position of the enclosing
 * call, when the callee is a known constructor, factory or `instance.method` of a known class; otherwise null.
 */
function parameterNameOf(
  code: string, at: number,
  bindings: ReadonlyMap<string, { module: string; name: string }>,
  moduleInterface: (path: string) => BuilderModuleInterface | null,
): string | null {
  // Walk back to the unmatched `(` of the enclosing call, counting top-level commas for the argument index.
  let depth = 0, index = 0, open = -1
  for (let i = at - 1; i >= 0; i--) {
    const ch = code[i]
    if (ch === ')' || ch === ']' || ch === '}') depth++
    else if (ch === '(' || ch === '[' || ch === '{') { if (depth === 0) { open = ch === '(' ? i : -1; break } depth-- }
    else if (ch === ',' && depth === 0) index++
    else if (ch === '\n' && depth === 0 && /[;{}]\s*$/.test(code.slice(Math.max(0, i - 40), i))) break
  }
  if (open < 0) return null
  const callee = new RegExp(`(?:\\bnew\\s+)?(${IDENT})(?:\\.(${IDENT}))?\\s*$`).exec(code.slice(Math.max(0, open - 200), open))
  if (!callee) return null
  let signature: BuilderSignature | undefined
  if (callee[2]) {
    // instance.method(...): the instance variable was created from a known class or factory.
    const created = new RegExp(`\\b(?:const|let|var)\\s+${callee[1]}\\s*=\\s*(?:new\\s+)?(${IDENT})\\s*\\(`).exec(code)
    const binding = created ? bindings.get(created[1]) : bindings.get(callee[1])
    const api = binding ? moduleInterface(binding.module) : null
    const className = binding && api ? (api.classes[binding.name] ? binding.name : api.factories[binding.name]) : undefined
    signature = className && api ? api.signatures[`${className}.prototype.${callee[2]}`] : undefined
  } else {
    const binding = bindings.get(callee[1])
    const api = binding ? moduleInterface(binding.module) : null
    signature = binding && api ? api.signatures[binding.name] : undefined
  }
  const param = signature?.params[index]
  return param ? param.replace(/\s*=.*$/, '').replace(/^\.\.\./, '').toLowerCase() : null
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
      if (!module || !api) continue
      // const Cart = require('../src/cart') with module.exports = Cart: the local name is the class itself.
      if (api.defaultExport && !api.exports.length) { bindings.set(found[1], { module, name: api.defaultExport }); continue }
      if (!api.exports.length) continue
      for (const use of code.matchAll(new RegExp(`\\b${found[1]}\\.(${IDENT})\\b`, 'g'))) {
        bindings.set(`${found[1]}.${use[1]}`, { module, name: use[1] })
        if (!api.exports.includes(use[1])) add({ test: test.path, line: lineOf(code, use.index!), module, name: use[1], kind: 'missing_export', available: api.exports })
      }
    }
    // new Cart(a, b) or createCart(a, b): the argument count must fit the declared parameters.
    for (const found of code.matchAll(new RegExp(`(?:\\bnew\\s+|(?<![\\w$.]))(${IDENT}(?:\\.${IDENT})?)\\s*\\(`, 'g'))) {
      const binding = bindings.get(found[1])
      const api = binding ? moduleInterface(binding.module) : null
      const signature = binding && api ? api.signatures[binding.name] : undefined
      if (!binding || !signature) continue
      const args = parenBody(code, found.index! + found[0].length - 1)
      if (args === null) continue
      const count = splitTopLevel(args).length
      const spread = /(^|[,(\s])\.\.\./.test(args)
      if (!spread && (count < signature.required || (!signature.rest && count > signature.params.length))) {
        add({ test: test.path, line: lineOf(code, found.index!), module: binding.module, kind: 'wrong_argument_count',
          name: `${binding.name}(${signature.params.join(', ')}) called with ${count} argument${count === 1 ? '' : 's'}`, available: signature.params })
      }
    }
    // new Cart(...).addItem(...) used as a value: the method must return this.
    for (const found of code.matchAll(new RegExp(`\\bnew\\s+(${IDENT})\\s*\\(`, 'g'))) {
      const binding = bindings.get(found[1])
      const api = binding ? moduleInterface(binding.module) : null
      if (!binding || !api || !api.classes[binding.name]) continue
      const args = parenBody(code, found.index! + found[0].length - 1)
      if (args === null) continue
      const after = code.slice(found.index! + found[0].length + args.length + 1)
      const chained = new RegExp(`^\\s*\\.(${IDENT})\\s*\\(`).exec(after)
      if (!chained) continue
      const callArgs = parenBody(after, chained[0].length - 1)
      if (callArgs === null) continue
      const next = after.slice(chained[0].length + callArgs.length + 1).trimStart()
      // Evidence that the result must be the instance: another method of the same class is called on it, or it
      // is passed to a parameter whose declared name is the class (`checkout(cart)` taking `new Cart().addItem()`).
      // A consumed number or id (`assert.equal(new Cart().total(), 0)`) is a legitimate non-chainable return.
      const chainedAgain = new RegExp(`^\\.(${IDENT})\\s*\\(`).exec(next)
      const requiresInstance = chainedAgain ? api.classes[binding.name].includes(chainedAgain[1])
        : (next.startsWith(',') || next.startsWith(')')) && parameterNameOf(code, found.index!, bindings, moduleInterface) === binding.name.toLowerCase()
      if (!requiresInstance) continue
      if (!(api.chainable[binding.name] ?? []).includes(chained[1]) && api.classes[binding.name].includes(chained[1])) {
        add({ test: test.path, line: lineOf(code, found.index!), module: binding.module, kind: 'method_not_chainable',
          name: `${binding.name}.prototype.${chained[1]} must return this`, available: api.chainable[binding.name] ?? [] })
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
  // Sources against sources: a module mutates a field on an object another module's getter returned as a copy,
  // so the change is lost. Production 2026-10-17: inventory.deduct() did `product.quantity -= n` on the copy
  // catalog.getProduct() returned; stock never moved and 6 tests failed with "expected 2, actual 5".
  // The receiver is resolved, never guessed from the method name: `this.<field>` must be assigned from a
  // constructor parameter, and a test must construct the class passing an instance of a known class (or the
  // result of its factory) at that parameter's position. A dynamically supplied client stays unattributed.
  for (const source of files) {
    if (TEST_PATH.test(source.path) || !/\.[cm]?js$/.test(source.path)) continue
    const api = moduleInterface(source.path)
    if (!api) continue
    const code = source.content.slice(0, MAX_SOURCE)
    for (const className of Object.keys(api.classes)) {
      const fields = injectedFieldClasses(className, code, files, known, moduleInterface)
      if (!fields.size) continue
      const classHead = new RegExp(`\\bclass\\s+${className}\\b[^{]*\\{`).exec(code)
      const classBody = classHead ? braceBody(code, classHead.index + classHead[0].length - 1) : null
      if (!classBody) continue
      const classStart = classHead!.index + classHead![0].length
      for (const found of classBody.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:await\\s+)?this\\.(${IDENT})\\.(${IDENT})\\s*\\(`, 'g'))) {
        const owner = fields.get(found[2])
        const ownerApi = owner ? moduleInterface(owner.module) : null
        const getter = ownerApi?.copyReturning[owner!.className]?.find(item => item.method === found[3])
        if (!owner || !getter || owner.module === source.path) continue
        // Only the declaration's own block, and only until the name is declared again.
        const scope = enclosingBlock(classBody, found.index! + found[0].length)
        const redeclared = new RegExp(`\\b(?:const|let|var)\\s+${found[1]}\\b`).exec(scope)
        const visible = redeclared ? scope.slice(0, redeclared.index) : scope
        const mutation = new RegExp(`\\b${found[1]}\\.(${IDENT})\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)`).exec(visible)
        if (!mutation) continue
        add({ test: source.path, line: lineOf(code, classStart + found.index! + found[0].length + mutation.index), module: owner.module, kind: 'mutates_defensive_copy',
          name: `${owner.className}.prototype.${found[3]} returns a copy (${owner.module}:${getter.line}); ${source.path} mutates ${found[1]}.${mutation[1]} on it`,
          available: [] })
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
): Promise<Array<{ module: string; exports: string[]; classes: Record<string, string[]>; factories: Record<string, string>; signatures: Record<string, string> }>> {
  if (!workspace) return []
  const files = await readJavaScript(workspace, workspaceId, knownPaths.filter(path => !TEST_PATH.test(path)))
  return files.map(file => builderModuleInterface(file.path, file.content.slice(0, MAX_SOURCE)))
    .filter((api): api is BuilderModuleInterface => Boolean(api))
    // Signatures as text (`Cart(catalog)`, `Cart.prototype.addItem(productId, quantity = 1)`) so tests written next call the real API.
    .map(({ module, exports, classes, factories, signatures }) => ({ module, exports, classes, factories,
      signatures: Object.fromEntries(Object.entries(signatures).map(([name, signature]) => [name, `${name}(${signature.params.join(', ')})`])) }))
}
