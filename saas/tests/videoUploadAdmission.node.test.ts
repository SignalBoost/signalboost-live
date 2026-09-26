import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const upload = readFileSync(new URL('../app/api/video/upload/route.ts', import.meta.url), 'utf8')
const transcribe = readFileSync(new URL('../app/api/video/transcribe/route.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('service-role video upload requires sign-in before reading the body', () => {
  const auth = upload.indexOf('await getAccess()')
  const body = upload.indexOf('await request.formData()')
  assert.ok(auth > 0 && body > 0 && auth < body)
  assert.match(upload, /status: 401|,\s*401,/)
})

test('only real video containers are stored, with a server-chosen content type', () => {
  assert.match(upload, /mp4: 'video\/mp4'/)
  assert.match(upload, /webm: 'video\/webm'/)
  assert.match(upload, /videoContentType\(video\.name/)
  assert.match(upload, /415/)
  assert.doesNotMatch(upload, /contentType: video\.type/)
  assert.match(upload, /uploads\/\$\{access\.userId\}\//)
  assert.doesNotMatch(upload, /error: uploadError\.message/)
})

test('stored-video captioning signs in first and only reads the caller\'s own objects', () => {
  const auth = transcribe.indexOf('const user = await getUser()')
  const read = transcribe.indexOf('await getVideoFromRequest(request, user.id)')
  assert.ok(auth > 0 && read > 0 && auth < read)
  assert.equal((transcribe.match(/await getUser\(\)/g) || []).length, 1)
  assert.match(transcribe, /bucket !== defaultStorageBucket \|\| !ownedStoragePath\(path, userId\)/)
  assert.match(transcribe, /value\.startsWith\(`\$\{userId\}\/`\)/)
  assert.doesNotMatch(transcribe, /throw new Error\(error\?\.message/)
})

test('video upload admission is part of the Production gate', () => {
  assert.match(gate, /videoUploadAdmission\.node\.test\.ts/)
})
