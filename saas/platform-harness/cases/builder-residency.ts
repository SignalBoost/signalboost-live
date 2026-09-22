import { createHash } from 'node:crypto'
import type { BuilderResidencyCompetency } from '../../lib/ai/cos/cosUniversityResidency.ts'

export interface BuilderResidencyCase {
  caseFamily: string
  competencyId: BuilderResidencyCompetency
  variantId: string
  variantHash: string
  objective: string
  seedFiles: readonly Readonly<{path:string;content:string}>[]
  provingCommand: string
}

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

function makeCase(input:Omit<BuilderResidencyCase,'variantHash'>):BuilderResidencyCase{
  return Object.freeze({...input,variantHash:hash({
    caseFamily:input.caseFamily,
    competencyId:input.competencyId,
    variantId:input.variantId,
    objective:input.objective,
    seedFiles:input.seedFiles,
    provingCommand:input.provingCommand,
  })})
}

/**
 * Initial supervised Builder Residency case catalog.
 * These are teaching/practice cases, never hidden final exam material.
 */
export const BUILDER_RESIDENCY_CASES=Object.freeze([
  makeCase({
    caseFamily:'off_by_one_repository_repair',
    competencyId:'root_cause_diagnosis',
    variantId:'v1-total-loop',
    objective:'Inspect total.js, reproduce the defect, repair the loop boundary, and prove the same command now succeeds.',
    seedFiles:Object.freeze([{path:'total.js',content:[
      'function total(values) {',
      '  let sum = 0',
      '  for (let index = 0; index <= values.length; index += 1) sum += values[index]',
      '  return sum',
      '}',
      'if (total([1,2,3]) !== 6) throw new Error(String(total([1,2,3])))',
      'console.log("ok")',
      '',
    ].join('\n')}]),
    provingCommand:'node total.js',
  }),
  makeCase({
    caseFamily:'missing_local_module_recovery',
    competencyId:'recovery_from_wrong_initial_diagnosis',
    variantId:'v1-format-report',
    objective:'Run report.js, use the actual failure evidence to identify the missing local module, implement only what is required, then rerun the same command.',
    seedFiles:Object.freeze([{path:'report.js',content:[
      "const { formatReport } = require('./format-report.js')",
      "const value = formatReport({ title: 'Quarterly', total: 42 })",
      "if (value !== 'Quarterly: 42') throw new Error(value)",
      'console.log(value)',
      '',
    ].join('\n')}]),
    provingCommand:'node report.js',
  }),
  makeCase({
    caseFamily:'regression_test_construction',
    competencyId:'test_and_regression_construction',
    variantId:'v1-slug-normalization',
    objective:'Repair slug.js and add a regression test that proves repeated whitespace and punctuation normalize safely. Run the test command and preserve the evidence.',
    seedFiles:Object.freeze([
      {path:'slug.js',content:[
        'function slug(value) {',
        "  return value.toLowerCase().replace(' ', '-')",
        '}',
        'module.exports = { slug }',
        '',
      ].join('\n')},
      {path:'slug.test.js',content:[
        "const { slug } = require('./slug.js')",
        "if (slug('Hello   World!') !== 'hello-world') throw new Error(slug('Hello   World!'))",
        'console.log("ok")',
        '',
      ].join('\n')},
    ]),
    provingCommand:'node slug.test.js',
  }),
] as const)

export function builderResidencyCaseByVariantHash(value:string):BuilderResidencyCase|null{
  return BUILDER_RESIDENCY_CASES.find(item=>item.variantHash===value)??null
}
