// Run real negative fixtures against the production translation validator.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  // An approval for different text must be invalid even with a real reviewer identity.
  const firstPack=JSON.parse(fs.readFileSync(path.join(dir,'de.json'),'utf8'))
  const [firstStore,firstKey]=['pages',Object.keys(firstPack.pages)[0]]
  firstPack[firstStore][firstKey].translation='Prüfübersetzung'
  fs.writeFileSync(path.join(dir,'de.json'),JSON.stringify(firstPack))
  const forged={ [firstStore]: { [firstKey]: {status:'approved',reviewer:'translator-QA',translationSha256:createHash('sha256').update(JSON.stringify('different approved text')).digest('hex')} } }
  fs.writeFileSync(path.join(dir,'de.review.json'),JSON.stringify(forged))
  const mismatched=run(['scripts/validate-translated-packages.mjs',dir,'--require-reviewed'])
  assert.equal(mismatched.status,1,'Approval hash for other text must not pass')
  assert.match(mismatched.stderr,/explicit reviewer approval missing/)
  // Approval must also be tied to the specific English source that was reviewed.
  // A correct target hash with a stale/wrong source hash cannot authorize an import.
  forged[firstStore][firstKey]={
    status:'approved',reviewer:'translator-QA',
    translationSha256:createHash('sha256').update(JSON.stringify(firstPack[firstStore][firstKey].translation)).digest('hex'),
    sourceSha256:createHash('sha256').update(JSON.stringify('old English source')).digest('hex')
  }
  fs.writeFileSync(path.join(dir,'de.review.json'),JSON.stringify(forged))
  const staleSource=run(['scripts/validate-translated-packages.mjs',dir,'--require-reviewed'])
  assert.equal(staleSource.status,1,'Approval tied to outdated English source must fail')
  assert.match(staleSource.stderr,/explicit reviewer approval missing/)
  console.log('PASS: missing keys, missing reviews, stale target hashes and outdated source approvals blocked')
} finally {fs.rmSync(dir,{recursive:true,force:true})}
