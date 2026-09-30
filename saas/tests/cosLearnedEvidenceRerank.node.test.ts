import assert from 'node:assert/strict'
import { coverageScores, rerankLearnedRowsForQuestion } from '../lib/ai/cos/learnedEvidenceRerank.ts'

const terms=['kubernetes','readiness','liveness','horizontal','vertical']
const rows=[
 {text:'Kubernetes has become the de facto standard for container orchestration.', similarity:.84},
 {text:'Kubernetes readiness and liveness probes control traffic and restarts.', similarity:.70},
 {text:'Horizontal pod autoscaling and vertical pod autoscaling address different resource dimensions.', similarity:.68},
]
const scores=coverageScores(terms, rows.map(r=>r.text))
assert.ok(scores[1] > scores[0])
assert.ok(scores[2] > scores[0])
const ranked=rerankLearnedRowsForQuestion(terms,rows,r=>r.text,r=>r.similarity)
assert.notEqual(ranked[0].text, rows[0].text)
assert.deepEqual(rerankLearnedRowsForQuestion([],rows,r=>r.text,r=>r.similarity),rows)
console.log('cos learned evidence rerank tests passed')
