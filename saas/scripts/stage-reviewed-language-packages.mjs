// Materialize only six fully reviewed, source-matched packages into nonproduction locale files.
// This does not activate languages or alter app-owned translations.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateTranslationPackages, LANGUAGES } from './verify-six-language-review-gate.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const sources = {
  main:'locales/en.json',
  pages:'locales/pages.en.json',
  console:'lib/i18n/console.en.json',
  audit:'lib/i18n/audit.en.json',
  onboarding:'lib/i18n/onboardingLocales.json',
  marketingSales:'lib/i18n/marketingSalesLocales.json',
  auditCenter:'lib/i18n/auditCenterLocales.json',
  supervisor:'lib/i18n/supervisorSocLocales.json',
  homepage:'lib/i18n/homepageLocales.json'
}
const multi = new Set(['onboarding','marketingSales','auditCenter','supervisor','homepage'])
export function flatten(value, prefix='', result={}) {
  for(const [key,child] of Object.entries(value)){
    const id = prefix ? prefix+'.'+key : key
    if(child && typeof child==='object' && !Array.isArray(child)) flatten(child,id,result)
    else result[id]={source:child}
  }
  return result
}
export function apply(source, entries) {
  const walk = (value,prefix='') => Object.fromEntries(Object.entries(value).map(([key,child])=>{
    const id=prefix?prefix+'.'+key:key
    return [key,child && typeof child==='object' && !Array.isArray(child)
      ? walk(child,id) : entries[id].translation]
  }))
  return walk(source)
}
export function stageReviewedPackages(directory, output) {
  if(path.resolve(directory)===path.resolve(output)) throw Error('Input and output must differ')
  if(!fs.existsSync(path.join(directory,'manifest.json'))) throw Error('Missing package manifest')
  const manifest=read(path.join(directory,'manifest.json'))
  if(!same(manifest.languages,LANGUAGES)) throw Error('Unexpected locales')
  const reference={}
  for(const [store,file] of Object.entries(sources)){
    const source=read(path.join(root,file))
    reference[store]=flatten(multi.has(store)?source.en:source)
  }
  const packs={},reviews={}
  for(const lang of LANGUAGES){
    packs[lang]=read(path.join(directory,lang+'.json'))
    reviews[lang]=read(path.join(directory,lang+'.review.json'))
  }
  const outcome=validateTranslationPackages(reference,packs,reviews)
  if(!outcome.ok) throw Error('Translation release gate failed: '+outcome.problems.slice(0,10).join('; '))
  // Full validation occurs before the first output is written.
  if(fs.existsSync(output) && fs.readdirSync(output).length) throw Error('Output directory must be empty')
  fs.mkdirSync(output,{recursive:true})
  for(const lang of LANGUAGES){
    for(const [store,file] of Object.entries(sources)){
      const source=read(path.join(root,file))
      const translated=apply(multi.has(store)?source.en:source,packs[lang][store])
      const dest=path.join(output,store+'.'+lang+'.json')
      fs.writeFileSync(dest,JSON.stringify(translated,null,2)+'\n')
    }
  }
  return {languages:LANGUAGES,stores:Object.keys(sources),status:'STAGED_NOT_ACTIVATED'}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4) throw Error('Usage: node scripts/stage-reviewed-language-packages.mjs <reviewed-package-dir> <empty-output-dir>')
  console.log(JSON.stringify(stageReviewedPackages(process.argv[2],process.argv[3]),null,2))
}
