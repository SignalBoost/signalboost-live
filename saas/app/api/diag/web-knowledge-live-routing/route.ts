import { NextResponse } from 'next/server'
import {
  WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
  createCosProductionIngressManifest,
  createWebKnowledgeResearchPort,
  withCosHarnessIngress,
} from '@/platform-harness/index'
import { searchThroughGovernedWebKnowledge } from '@/lib/ai/tools/governedWebKnowledgeSearch'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(){
  const parent=createCosProductionIngressManifest({
    runId:'web-knowledge-diag',
    objective:'research a current public topic',
    tenantId:'itmounts',
    requestedCapabilities:[WEB_KNOWLEDGE_RESEARCH_CAPABILITY],
  })
  const evidence:any[]=[]
  const research=createWebKnowledgeResearchPort({
    search:async()=>[{
      uri:'https://example.edu/paper',
      title:'Example research',
      text:'A source-backed research finding suitable for evidence synthesis.',
      evidence:['source_class=scholarly'],
      license:'reference_only',
    }],
  })
  try{
    const result=await withCosHarnessIngress(parent,()=>searchThroughGovernedWebKnowledge({
      query:'research finding',
      count:3,
      research,
      evidenceSink:{async append(record){evidence.push(record)}},
    }))
    return NextResponse.json({
      result,
      evidence:evidence.map(row=>({
        runId:row?.runId,
        parentRunId:row?.parentRunId,
        outcomeStatus:row?.outcomeStatus,
        failureCode:row?.failureCode,
        productionMutationObserved:row?.productionMutationObserved,
      })),
      parent:{runId:parent.runId,authorityManifestRef:parent.authorityManifestRef,limits:parent.limits},
    })
  }catch(error){
    return NextResponse.json({
      thrown:error instanceof Error?error.message:String(error),
      evidence,
      parent:{runId:parent.runId,authorityManifestRef:parent.authorityManifestRef,limits:parent.limits},
    },{status:500})
  }
}
