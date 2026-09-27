import assert from 'node:assert/strict'
import test from 'node:test'
import {
  admitNextBuilderResidency,
  BUILDER_RESIDENCY_PROGRAM_ID,
} from '../platform-harness/index.ts'

const hash=(char:string)=>char.repeat(64)

function capacityDb(activeCount:number){
  let artifactReads=0
  const db:any={
    from(table:string){
      if(table==='cos_university_residency_enrollments'){
        return {
          select(){
            return {
              in(){
                return {
                  async limit(limit:number){
                    return {
                      data:Array.from({length:Math.min(activeCount,limit)},(_,i)=>({id:`r-${i}`})),
                      error:null,
                    }
                  },
                }
              },
            }
          },
        }
      }
      if(table==='cos_local_distillation_artifacts'){
        artifactReads+=1
        throw new Error('artifact_read_must_not_happen')
      }
      throw new Error(`unexpected_table:${table}`)
    },
  }
  return {db,artifactReads:()=>artifactReads}
}

test('auto admission respects the active resident ceiling before reading candidates',async()=>{
  const mock=capacityDb(4)
  const out=await admitNextBuilderResidency({db:mock.db,activeLimit:4})
  assert.equal(out.ok,true)
  assert.equal(out.admitted,false)
  assert.equal(out.reason,'residency_active_capacity_full')
  assert.equal(out.activeResidents,4)
  assert.equal(out.activeLimit,4)
  assert.equal(out.promotionAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
  assert.equal(mock.artifactReads(),0)
})

test('auto admission creates exactly one idempotent enrollment for the oldest eligible artifact',async()=>{
  const writes:any[]=[]
  const artifact={
    id:'59152ebf-3634-4c01-beb1-35cb31d6ecaf',
    candidate_id:'mass:test:0123456789abcdef',
    subject_id:'Computer Science & Coding',
    trained_artifact_id:'cadomos/itmounts-student-test',
    trained_artifact_hash:hash('a'),
    revision_key:hash('b'),
    status:'evaluation_pending',
    authority_expanded:false,
  }

  const db:any={
    from(table:string){
      if(table==='cos_local_distillation_artifacts'){
        return {
          select(){
            return {
              eq(){return this},
              like(){return this},
              order(){return this},
              async limit(){
                return {data:[artifact],error:null}
              },
            }
          },
        }
      }

      if(table==='cos_university_residency_enrollments'){
        return {
          select(){
            return {
              in(){
                return {
                  async limit(){return {data:[],error:null}},
                }
              },
              eq(){return this},
              async maybeSingle(){return {data:null,error:null}},
            }
          },
          upsert(value:any,options:any){
            writes.push({value,options})
            return {
              select(){
                return {
                  async maybeSingle(){
                    return {data:{id:'residency-1',standing:'resident'},error:null}
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`unexpected_table:${table}`)
    },
  }

  const out=await admitNextBuilderResidency({db,activeLimit:4})

  assert.equal(out.ok,true)
  assert.equal(out.admitted,true)
  assert.equal(out.residencyId,'residency-1')
  assert.equal(out.created,true)
  assert.equal(writes.length,1)
  assert.equal(writes[0].options.onConflict,'artifact_row_id,program_id')
  assert.equal(writes[0].options.ignoreDuplicates,true)
  assert.equal(writes[0].value.artifact_row_id,artifact.id)
  assert.equal(writes[0].value.candidate_id,artifact.candidate_id)
  assert.equal(writes[0].value.program_id,BUILDER_RESIDENCY_PROGRAM_ID)
  assert.equal(writes[0].value.standing,'resident')
  assert.match(writes[0].value.admission_evidence_hash,/^[a-f0-9]{64}$/)
  assert.equal(writes[0].value.gate_enforced,false)
  assert.equal(writes[0].value.authority_expanded,false)
  assert.equal(out.promotionAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
})

test('auto admission skips an already-enrolled artifact and admits the next candidate only',async()=>{
  const writes:any[]=[]
  const artifacts=[
    {
      id:'59152ebf-3634-4c01-beb1-35cb31d6ecaf',
      candidate_id:'mass:first:0123456789abcdef',
      subject_id:'Computer Science & Coding',
      trained_artifact_id:'cadomos/itmounts-student-first',
      trained_artifact_hash:hash('c'),
      revision_key:hash('d'),
      status:'evaluation_pending',
      authority_expanded:false,
    },
    {
      id:'2efaa27a-56ed-4b7c-82c9-280e9bb283a0',
      candidate_id:'mass:second:0123456789abcdef',
      subject_id:'Computer Science & Coding',
      trained_artifact_id:'cadomos/itmounts-student-second',
      trained_artifact_hash:hash('e'),
      revision_key:hash('f'),
      status:'evaluation_pending',
      authority_expanded:false,
    },
  ]

  const db:any={
    from(table:string){
      if(table==='cos_local_distillation_artifacts'){
        return {
          select(){
            return {
              eq(){return this},
              like(){return this},
              order(){return this},
              async range(){return {data:artifacts,error:null}},
            }
          },
        }
      }

      if(table==='cos_university_residency_enrollments'){
        return {
          select(){
            const state:any={
              artifactId:'',
              in(){
                return {
                  async limit(){return {data:[],error:null}},
                }
              },
              eq(column:string,value:string){
                if(column==='artifact_row_id') state.artifactId=value
                return state
              },
              async maybeSingle(){
                return {
                  data:state.artifactId===artifacts[0].id?{id:'already-enrolled'}:null,
                  error:null,
                }
              },
            }
            return state
          },
          upsert(value:any,options:any){
            writes.push({value,options})
            return {
              select(){
                return {
                  async maybeSingle(){
                    return {data:{id:'residency-2',standing:'resident'},error:null}
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`unexpected_table:${table}`)
    },
  }

  const out=await admitNextBuilderResidency({db})
  assert.equal(out.ok,true)
  assert.equal(out.admitted,true)
  assert.equal(writes.length,1)
  assert.equal(writes[0].value.artifact_row_id,artifacts[1].id)
})


test('auto admission pages past an enrolled first window instead of starving an aged candidate',async()=>{
  const writes:any[]=[]
  const enrolled=Array.from({length:64},(_,i)=>({
    id:`enrolled-${i}`,
    candidate_id:`mass:enrolled-${i}:0123456789abcdef`,
    subject_id:'Computer Science & Coding',
    trained_artifact_id:`cadomos/enrolled-${i}`,
    trained_artifact_hash:hash('a'),
    revision_key:hash('b'),
    status:'evaluation_pending',
    authority_expanded:false,
  }))
  const aged={
    id:'59152ebf-3634-4c01-beb1-35cb31d6ecaf',
    candidate_id:'mass:aged:0123456789abcdef',
    subject_id:'Computer Science & Coding',
    trained_artifact_id:'cadomos/aged-candidate',
    trained_artifact_hash:hash('c'),
    revision_key:hash('d'),
    status:'evaluation_pending',
    authority_expanded:false,
  }
  const pages=[enrolled,[aged]]
  let page=0
  const db:any={
    from(table:string){
      if(table==='cos_local_distillation_artifacts') return {
        select(){return {
          eq(){return this}, like(){return this}, order(){return this},
          async range(){return {data:pages[page++]??[],error:null}},
        }},
      }
      if(table==='cos_university_residency_enrollments') return {
        select(){
          const state:any={
            artifactId:'',
            in(){return {async limit(){return {data:[],error:null}}}},
            eq(column:string,value:string){if(column==='artifact_row_id') state.artifactId=value; return state},
            async maybeSingle(){
              return {data:state.artifactId.startsWith('enrolled-')?{id:`res-${state.artifactId}`}:null,error:null}
            },
          }
          return state
        },
        upsert(value:any,options:any){
          writes.push({value,options})
          return {select(){return {async maybeSingle(){return {data:{id:'aged-residency',standing:'resident'},error:null}}}}}
        },
      }
      throw new Error(`unexpected_table:${table}`)
    },
  }

  const out=await admitNextBuilderResidency({db,activeLimit:4})
  assert.equal(out.ok,true)
  assert.equal(out.admitted,true)
  assert.equal(out.residencyId,'aged-residency')
  assert.equal(page,2)
  assert.equal(writes.length,1)
  assert.equal(writes[0].value.artifact_row_id,aged.id)
})
