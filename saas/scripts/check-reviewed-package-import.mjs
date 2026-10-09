import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=fs.mkdtempSync(path.join(root,'.i18n-import-negative-'))
try{
 const run=(args)=>spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'})
 const exported=run(['scripts/export-eleven-language-translation-packages.mjs','--out',path.relative(root,out)])
 assert.equal(exported.status,0,exported.stderr)
 const before=fs.readFileSync(path.join(root,'lib/i18n/homepageLocales.json'),'utf8')
 const blocked=run(['scripts/import-reviewed-language-packages.mjs',out])
 assert.notEqual(blocked.status,0,'unreviewed packages must never be imported')
 assert.match(blocked.stderr,/Reviewed package validation failed/)
 assert.equal(fs.readFileSync(path.join(root,'lib/i18n/homepageLocales.json'),'utf8'),before)
 assert.equal(fs.existsSync(path.join(root,'locales/de.json')),false,'no partial locale outputs')
 console.log('PASS: importing incomplete, unreviewed translations fails before file writes')
}finally{fs.rmSync(out,{recursive:true,force:true})}
