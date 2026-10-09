// Complete-platform release gate. Run with --require-all before enabling six new locales.
// Without the flag, print missing coverage but do not imply readiness.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const additions = ['de','fr','it','ja','ko','ar']
const all = ['en','es','pt','pl','ru',...additions]
const issues = []
const fixedLocaleList = /\[\s*['\"]en['\"]\s*,\s*['\"]es['\"]\s*,\s*['\"]pt['\"]\s*,\s*['\"]pl['\"]\s*,\s*['\"]ru['\"]\s*\]/g
const sourceExt = /\.(?:ts|tsx|js|jsx|mjs)$/
const excludedDirectories = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])
function scanPinnedLanguageLists(dir) {
  if (!exists(dir)) return
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    const rel = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) scanPinnedLanguageLists(rel)
    } else if (sourceExt.test(entry.name) && !rel.includes('.test.') && !rel.includes('/tests/')) {
      if (rel === 'lib/i18n/supportedLanguages.ts' || rel === 'scripts/check-five-language-platform.mjs' || rel === 'scripts/check-eleven-language-coverage.mjs' || rel === 'scripts/generated-ui-locale-utils.mjs') continue
      const source = load(rel)
      if (fixedLocaleList.test(source)) issues.push(rel + ': hardcoded five-language array requires eleven-language review')
      fixedLocaleList.lastIndex = 0
    }
  }
}

const load = rel => fs.readFileSync(path.join(root,rel),'utf8')
const exists = rel => fs.existsSync(path.join(root,rel))
const flatten = (x, prefix='', out={}) => {
  if (x && typeof x==='object' && !Array.isArray(x)) {
    for(const [key,val] of Object.entries(x)) flatten(val,prefix ? prefix+'.'+key:key,out)
  } else out[prefix]=x
  return out
}
const json = rel => JSON.parse(load(rel))
for (const pattern of ['locales/{lang}.json','locales/pages.{lang}.json','lib/i18n/console.{lang}.json','lib/i18n/audit.{lang}.json']) {
  const enPath=pattern.replace('{lang}','en')
  const baseline=flatten(json(enPath))
  for (const lang of additions) {
    const rel=pattern.replace('{lang}',lang)
    if (!exists(rel)) {issues.push(rel+': missing');continue}
    const catalog=flatten(json(rel))
    for (const key of Object.keys(baseline)) {
      if (!(key in catalog) || (typeof catalog[key]==='string' && !catalog[key].trim()))
        issues.push(rel+': missing/blank '+key)
      // Identical strings are reported for linguistic review, not automatically
      // rejected: proper nouns and fixed technical terms are legitimate.
      else if (typeof baseline[key]==='string' && baseline[key].trim().length>30 && baseline[key]===catalog[key])
        issues.push(rel+': unchanged English candidate '+key)
    }
    for (const key of Object.keys(catalog)) if (!(key in baseline)) issues.push(rel+': unexpected '+key)
  }
}
for(const rel of [
 'lib/i18n/onboardingLocales.json','lib/i18n/marketingSalesLocales.json',
 'lib/i18n/auditCenterLocales.json','lib/i18n/supervisorSocLocales.json',
 'lib/i18n/homepageLocales.json'
]) {
  const catalog=json(rel)
  for(const lang of additions) {
    if(!catalog[lang]) {issues.push(rel+': missing '+lang);continue}
    const en=flatten(catalog.en), loc=flatten(catalog[lang])
    for(const key of Object.keys(en)) if(!(key in loc)) issues.push(rel+': '+lang+' missing '+key)
  }
}
for (const rel of ['lib/i18n/homepageUiLocales.ts','lib/i18n/platformCopy.ts',
 'lib/i18n/hardcoded-ui-copy.ts']) {
  const source=load(rel)
  for (const lang of additions) if(!new RegExp('\\b'+lang+':\\s*\\{').test(source))
    issues.push(rel+': missing '+lang+' block')
}
for (const rel of ['lib/i18n/loadLanguage.ts','lib/i18n/pageLocales.ts',
 'scripts/generated-ui-locale-utils.mjs']) {
  const source=load(rel)
  for(const lang of additions) if(!new RegExp('\\b'+lang+'\\b').test(source))
    issues.push(rel+': missing '+lang+' registration')
}
// Inventory duplicated runtime locale lists beyond the canonical contract.
for (const dir of ['app', 'components', 'lib', 'marketing-sales-core', 'scripts']) scanPinnedLanguageLists(dir)
const core=load('lib/i18n/supportedLanguages.ts')
for(const lang of all) if(!core.includes("'"+lang+"'")) issues.push('canonical registry missing '+lang)
console.log('[eleven-language coverage] '+(issues.length?'NOT READY':'ALL REQUIRED SOURCES PRESENT'))
for(const issue of issues.slice(0,150)) console.log(' - '+issue)
if(issues.length>150) console.log(' ... '+(issues.length-150)+' additional gaps')
console.log('Total gaps: '+issues.length)
// Any activation of a pending locale must automatically activate the strict release gate.\n// A forgotten --require-all flag must never make incomplete production locales deployable.\nconst activeLine = core.match(/SUPPORTED_LANGUAGES\\s*=\\s*\\[([^\\]]+)\\]/)?.[1] || ''\nconst enabledCandidates = additions.filter(lang => new RegExp("['\\\"]" + lang + "['\\\"]").test(activeLine))\nif ((process.argv.includes('--require-all') || enabledCandidates.length > 0) && issues.length) {\n  console.error('[eleven-language coverage] FAIL — incomplete locales cannot be activated: ' + enabledCandidates.join(', '))\n  process.exit(1)\n}
