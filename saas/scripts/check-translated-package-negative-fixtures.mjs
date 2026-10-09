// Run real negative fixtures against the production translation validator.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = fs.mkdtempSync(path.join(root,'.i18n-verify-'))
const run = script => spawnSync(process.execPath,script,{cwd:root,encoding:'utf8'})
try {
  const exported = run(['scripts/export-eleven-language-translation-packages.mjs','--out',path.relative(root,dir)])
  assert.equal(exported.status,0,exported.stderr)
  const validator = () => run(['scripts/validate-translated-packages.mjs',dir])
  const result = validator()
  assert.equal(result.status,1,'Untranslated packages must fail closed')
  assert.match(result.stderr,/missing translation/)
  const filename=path.join(dir,'manifest.json')
  const manifest=JSON.parse(fs.readFileSync(filename,'utf8'))
  delete manifest.stores.de.audit
  fs.writeFileSync(filename,JSON.stringify(manifest))
  const omitted=validator()
  assert.equal(omitted.status,1,'Omitted catalog must fail closed')
  assert.match(omitted.stderr,/required source stores missing or unexpected/)
  // Even a structurally valid manifest cannot waive explicit review requirements.
  manifest.stores.de.audit = Object.keys(JSON.parse(fs.readFileSync(path.join(dir,'de.json'),'utf8')).audit).length
  fs.writeFileSync(filename,JSON.stringify(manifest))
  const reviewRequired=run(['scripts/validate-translated-packages.mjs',dir,'--require-reviewed'])
  assert.equal(reviewRequired.status,1,'Absent reviewer metadata must fail closed')
  assert.match(reviewRequired.stderr,/no reviewed translation metadata/)
  console.log('PASS: incomplete translations, omitted catalog and missing reviews blocked')
} finally {fs.rmSync(dir,{recursive:true,force:true})}
