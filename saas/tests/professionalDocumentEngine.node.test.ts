import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectProfessionalDocumentKind,
  professionalDocumentDirective,
} from '../lib/ai/cos/professionalDocumentEngine.ts'
import { scriptRequestDirective } from '../lib/ai/cos/scriptRequestIntent.ts'

test('rough correspondence is detected as email even when the user only says edit', () => {
  const input = 'edit - Dear AskISSO, We had Enterprise Wi Fi installed a few months ago but it is still not active. Thank you.'
  assert.equal(detectProfessionalDocumentKind(input), 'email')
  const directive = professionalDocumentDirective(input) || ''
  assert.match(directive, /automatically provide a concise, specific subject line/i)
  assert.match(directive, /The user should not need a second turn/i)
  assert.match(directive, /never guess an email address/i)
})

test('email body-only instruction suppresses automatic subject structure', () => {
  const directive = professionalDocumentDirective('Draft an email body only asking the vendor for an activation update.') || ''
  assert.match(directive, /body-only\/no subject/i)
  assert.doesNotMatch(directive, /The user should not need a second turn/i)
})

test('formal letters use placeholders instead of invented metadata when full layout is requested', () => {
  assert.equal(detectProfessionalDocumentKind('Write a complete formal letter of complaint to the corporate office.'), 'formal_letter')
  const directive = professionalDocumentDirective('Write a complete formal letter of complaint to the corporate office.') || ''
  assert.match(directive, /\[DATE\]/)
  assert.match(directive, /\[RECIPIENT ADDRESS\]/)
  assert.match(directive, /rather than inventing/i)
})

test('memo policy report and executive briefing types receive their own structures', () => {
  assert.equal(detectProfessionalDocumentKind('Prepare a memo for leadership about the migration decision.'), 'memo')
  assert.equal(detectProfessionalDocumentKind('Draft an SOP for incident escalation.'), 'policy')
  assert.equal(detectProfessionalDocumentKind('Write a technical report on the test results.'), 'report')
  assert.equal(detectProfessionalDocumentKind('Prepare an executive briefing for the board.'), 'executive_briefing')

  assert.match(professionalDocumentDirective('Prepare a memo for leadership about the migration decision.') || '', /To, From, Date, and Subject/i)
  assert.match(professionalDocumentDirective('Draft an SOP for incident escalation.') || '', /purpose, scope, definitions, responsibilities/i)
  assert.match(professionalDocumentDirective('Write a technical report on the test results.') || '', /findings or analysis/i)
  assert.match(professionalDocumentDirective('Prepare an executive briefing for the board.') || '', /senior-leader scan speed/i)
})

test('versioning changes the existing artifact instead of always producing five variants', () => {
  const directive = professionalDocumentDirective('Make this email more formal and give me another version.') || ''
  assert.match(directive, /VERSIONING/i)
  assert.match(directive, /Produce the requested new variant only/i)
  assert.match(directive, /multiple labeled versions only when the user explicitly asks/i)
})

test('multi-recipient routing never invents or exposes BCC recipients', () => {
  const ordinary = professionalDocumentDirective('Draft an email to Sarah and copy Motor Pool.') || ''
  assert.match(ordinary, /MULTI-RECIPIENT ROUTING/i)
  assert.match(ordinary, /BCC is included only when explicitly requested/i)

  const bcc = professionalDocumentDirective('Draft an email to Sarah, CC Motor Pool, and BCC the admin mailbox.') || ''
  assert.match(bcc, /keep BCC routing separate from visible recipient\/body text/i)
})

test('the global request-specific reasoner seam injects professional document intelligence', () => {
  const directive = scriptRequestDirective('Draft an email to AskISSO asking for the Enterprise Wi-Fi activation status.') || ''
  assert.match(directive, /PROFESSIONAL DOCUMENT MODE/)
  assert.match(directive, /EMAIL STRUCTURE/)
})

test('ordinary factual questions do not receive professional document directives', () => {
  assert.equal(professionalDocumentDirective('What is the current weather in Paramaribo?'), null)
  assert.equal(detectProfessionalDocumentKind('What is the title of the current president?'), null)
})
