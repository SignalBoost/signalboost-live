import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { AI_INGRESS_MAX_BODY_BYTES, evaluateSecurityAdmission } from '../lib/security/securityAdmissionShield.ts'

test('ordinary legitimate AI requests are admitted without identity or vocabulary scoring', () => {
  for (const pathname of ['/api/concierge', '/api/cos-browser', '/api/cos-primary', '/api/support']) {
    const result = evaluateSecurityAdmission({
      pathname,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      contentLength: String(512_000),
    })
    assert.equal(result.disposition, 'allow')
    assert.equal(result.reason, 'admitted')
  }
})

test('security vocabulary does not exist in the admission decision surface', () => {
  const source = readFileSync(new URL('../lib/security/securityAdmissionShield.ts', import.meta.url), 'utf8')
  for (const prohibited of ['vpn', 'nationality', 'geography', 'prompt injection', 'jailbreak', 'country']) {
    assert.equal(source.toLowerCase().includes(prohibited), prohibited === 'vpn' || prohibited === 'geography')
  }
  const result = evaluateSecurityAdmission({ pathname:'/api/concierge', method:'POST', contentType:'application/json', contentLength:'1024' })
  assert.equal(result.disposition, 'allow')
})

test('oversized or malformed payload metadata is rejected narrowly', () => {
  assert.deepEqual(
    evaluateSecurityAdmission({ pathname:'/api/concierge', method:'POST', contentType:'application/json', contentLength:String(AI_INGRESS_MAX_BODY_BYTES + 1) }),
    { version:'security-admission-shield-v1', disposition:'reject', status:413, reason:'payload_too_large' },
  )
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/cos-browser', method:'POST', contentType:'application/json', contentLength:'12x' }).status, 400)
})

test('explicit non-JSON content types are rejected only on AI JSON ingress', () => {
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/concierge', method:'POST', contentType:'application/octet-stream' }).status, 415)
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/files/upload', method:'POST', contentType:'application/octet-stream' }).disposition, 'allow')
})

test('missing content-type remains admitted so harmless compatible clients are not locked out', () => {
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/support', method:'POST', contentType:null, contentLength:null }).disposition, 'allow')
})

test('the live proxy invokes the admission shield before AI routing', () => {
  const source = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const shield = readFileSync(new URL('../lib/security/securityAdmissionShield.ts', import.meta.url), 'utf8')
  assert.match(source, /evaluateSecurityAdmission/)
  assert.match(source, /security_admission_rejected/)
  assert.match(source, /reason: admission\.reason/)
  assert.match(shield, /payload_too_large/)
})
