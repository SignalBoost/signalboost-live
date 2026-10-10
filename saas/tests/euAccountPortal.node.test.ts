import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const account = readFileSync(new URL('../app/eu/account/page.tsx', import.meta.url),'utf8')
const controls = readFileSync(new URL('../components/eu/EuAccountControls.tsx', import.meta.url),'utf8')
test('EU account page wires a single regional customer lifecycle surface',()=>{
 assert.match(account,/EuAccountControls/)
 assert.match(controls,/\/api\/auth\/eu\/config/)
 assert.match(controls,/\/api\/auth\/eu\/profile/)
 assert.match(controls,/\/api\/auth\/eu\/export/)
 assert.match(controls,/\/api\/auth\/eu\/data-rights/)
 assert.match(controls,/eu\.auth\.signOut/)
 assert.match(controls,/Request account deletion/)
 assert.match(controls,/not automatically fulfilled/)
 assert.doesNotMatch(controls,/NEXT_PUBLIC_SUPABASE_URL|\/dashboard|\/onboarding|utils\/supabase\/client/)
})
