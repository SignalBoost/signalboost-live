// Produces source-language translation packages for all six pending locales.
// Does not fabricate translations or enable incomplete languages in production.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pending = ['de', 'fr', 'it', 'ja', 'ko', 'ar']
const stores = {
  main: 'locales/en.json',
  pages: 'locales/pages.en.json',
  console: 'lib/i18n/console.en.json',
  audit: 'lib/i18n/audit.en.json',
}
const combinedStores = {
  onboarding: 'lib/i18n/onboardingLocales.json',
  marketingSales: 'lib/i18n/marketingSalesLocales.json',
  auditCenter: 'lib/i18n/auditCenterLocales.json',
  supervisor: 'lib/i18n/supervisorSocLocales.json',
  homepage: 'lib/i18n/homepageLocales.json',
}
function flatten(value, prefix='', result={}) {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? prefix + '.' + key : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, name, result)
    else result[name] = child
  }
  return result
}
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const english = Object.fromEntries([
  ...Object.entries(stores).map(([name,file]) => [name,flatten(read(file))]),
  ...Object.entries(combinedStores).map(([name,file]) => [name,flatten(read(file).en)]),
])
const out = path.resolve(root, process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1] : 'translation-packages')
if (!out.startsWith(root + path.sep)) throw new Error('Translation output must stay inside saas working tree')
fs.mkdirSync(out,{recursive:true})
const resume=process.argv.includes('--resume')
const manifest = {}
for (const lang of pending) {
  const packageData = {}
  for (const [store, items] of Object.entries(english)) {
    packageData[store] = Object.fromEntries(Object.entries(items).map(([key,source]) =>
      [key, { source, translation: null }]))
  }
  const destination=path.join(out,lang+'.json')
  if(resume && fs.existsSync(destination)) {
    const previous=JSON.parse(fs.readFileSync(destination,'utf8'))
    for(const [store,entries] of Object.entries(packageData)) {
      for(const [key,entry] of Object.entries(entries)) {
        const old=previous?.[store]?.[key]
        if(old && JSON.stringify(old.source)===JSON.stringify(entry.source) && old.translation!==null && old.translation!==undefined) {
          entry.translation=old.translation
        }
      }
    }
  }
  if(resume){
    const reviewPath=path.join(out,lang+'.review.json')
    if(fs.existsSync(reviewPath)){
      const reviews=JSON.parse(fs.readFileSync(reviewPath,'utf8'))
      for(const [store,entries] of Object.entries(reviews)){
        for(const key of Object.keys(entries)){
          const current=packageData?.[store]?.[key]
          const old=fs.existsSync(destination)?JSON.parse(fs.readFileSync(destination,'utf8'))?.[store]?.[key]:null
          if(!current || !old || JSON.stringify(old.source)!==JSON.stringify(current.source) || JSON.stringify(old.translation)!==JSON.stringify(current.translation)){
            delete reviews[store][key]
          }
        }
      }
      fs.writeFileSync(reviewPath,JSON.stringify(reviews,null,2)+'\n')
    }
  }
  fs.writeFileSync(destination,JSON.stringify(packageData,null,2)+'\n')
  manifest[lang] = Object.fromEntries(Object.entries(packageData).map(([store,entries]) =>
    [store,Object.keys(entries).length]))
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({languages:pending,stores:manifest,
  status:'UNTRANSLATED_SOURCE_PACKAGES',instructions:'Translate every source value; preserve keys, placeholders, named technical terms and markup. Review with native speakers. Do not deploy package data directly.'},null,2)+'\n')
console.log('Exported six source packages to '+out+' (resume='+resume+')')
