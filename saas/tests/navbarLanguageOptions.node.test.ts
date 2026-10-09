// saas/tests/navbarLanguageOptions.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
test('navbar offers all eleven platform languages and switches the dashboard in place',()=>{
 const source=fs.readFileSync(path.join(root,'components/PremiumCustomerNavbarV2.tsx'),'utf8')
 assert.deepEqual([...SUPPORTED_LANGUAGES],['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'])
 assert.match(source,/const\s+LANGUAGES\s*=\s*SUPPORTED_LANGUAGES/)
 assert.match(source,/onChange=\{event => changeLanguage\(event\.target\.value\)\}/)
 assert.match(source,/if \(publicLocaleFromPath\(pathname\)\) router\.push\(/)
 assert.match(source,/setLang\(code\)/)
 assert.doesNotMatch(source,/PENDING_LANGUAGE/)
})
test('every locale catalog labels every language in the navbar picker',()=>{
 for(const lang of SUPPORTED_LANGUAGES){
  const dict=JSON.parse(fs.readFileSync(path.join(root,`locales/${lang}.json`),'utf8'))
  for(const code of SUPPORTED_LANGUAGES) assert.ok(typeof dict.nav?.languages?.[code]==='string'&&dict.nav.languages[code].trim(),`${lang}: nav.languages.${code}`)
 }
})
test('localized public pages drive the navbar and footer language',()=>{
 const provider=fs.readFileSync(path.join(root,'components/i18n/I18nProvider.tsx'),'utf8')
 assert.match(provider,/const pageLocale = publicLocaleFromPath\(window\.location\.pathname\)\n  if \(pageLocale\) return pageLocale/)
 assert.match(provider,/if \(pageLocale && pageLocale !== lang\) \{\n      setLangState\(persistLanguage\(pageLocale\)\)/)
 const swap=(p:string,code:string)=>p.replace(/^\/[a-z]{2}(?=\/|$)/,`/${code}`)
 assert.equal(swap('/de','ja'),'/ja')
 assert.equal(swap('/de/ai-content','ar'),'/ar/ai-content')
})
