import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { AI_INGRESS_MAX_BODY_BYTES, SHIELD_ONLY_AI_INGRESS_PATHS, evaluateSecurityAdmission, isShieldOnlyAiIngress } from '../lib/security/securityAdmissionShield.ts'

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

test('every AI JSON route reaching model reasoning crosses the shield, not only the four originals', () => {
  for (const pathname of SHIELD_ONLY_AI_INGRESS_PATHS) {
    assert.equal(isShieldOnlyAiIngress(pathname, 'POST'), true)
    assert.equal(evaluateSecurityAdmission({ pathname, method:'POST', contentType:'application/json', contentLength:'2048' }).reason, 'admitted')
    assert.equal(evaluateSecurityAdmission({ pathname, method:'POST', contentType:'application/json', contentLength:String(AI_INGRESS_MAX_BODY_BYTES + 1) }).status, 413)
    assert.equal(evaluateSecurityAdmission({ pathname, method:'POST', contentType:'multipart/form-data; boundary=x' }).status, 415)
    assert.equal(evaluateSecurityAdmission({ pathname, method:'GET' }).reason, 'not_ai_ingress')
  }
})

test('fetch default text/plain is admitted on newly covered routes so existing clients are not locked out', () => {
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/builder', method:'POST', contentType:'text/plain;charset=UTF-8', contentLength:'100' }).disposition, 'allow')
  // The four original routes keep their stricter JSON-only rule unchanged.
  assert.equal(evaluateSecurityAdmission({ pathname:'/api/concierge', method:'POST', contentType:'text/plain;charset=UTF-8' }).status, 415)
})

test('shield-only routes are matched by the proxy and pass straight through without proxyBase', () => {
  const source = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(isShieldOnlyAiIngress\(pathname, req\.method\)\) return NextResponse\.next\(\)/)
  const shieldCheck = source.indexOf('evaluateSecurityAdmission({')
  const passThrough = source.indexOf('isShieldOnlyAiIngress(pathname, req.method)')
  const firstBase = source.indexOf('await baseProxy(req)')
  assert.ok(shieldCheck > 0 && shieldCheck < passThrough && passThrough < firstBase)
  const matcher = source.slice(source.indexOf('export const config'))
  for (const pathname of SHIELD_ONLY_AI_INGRESS_PATHS) assert.ok(matcher.includes(`'${pathname}'`), pathname)
})
