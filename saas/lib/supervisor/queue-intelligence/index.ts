import type { WorkItem } from '../coordination/index.ts'

export type QueueHealthStatus = 'healthy' | 'degraded' | 'critical'
export interface QueueHealthThresholds { warningDepth:number; criticalDepth:number; warningAgeMs:number; criticalAgeMs:number; processingStaleMs:number }
export interface QueueHealthIssue { code:'queue_backlog'|'queue_starvation'|'stuck_work_item'; severity:'warning'|'critical'; provider:string; subject:string; value:number }
export interface ProviderQueueHealth { provider:string; status:QueueHealthStatus; depth:number; oldestAgeMs:number; stuckItems:number }
export interface QueueHealthReport { status:QueueHealthStatus; score:number; checkedAt:string; totals:{queued:number;processing:number;stuck:number;providers:number}; providers:ProviderQueueHealth[]; issues:QueueHealthIssue[]; schemaVersion:'supervisor-queue-health-v1' }

const defaults: QueueHealthThresholds = { warningDepth:25, criticalDepth:100, warningAgeMs:300000, criticalAgeMs:1800000, processingStaleMs:900000 }
const terminal = new Set(['completed','failed','blocked','expired','abandoned'])
const age = (item:WorkItem, now:number) => { const parsed=Date.parse(item.availableAt||item.createdAt); return Number.isFinite(parsed)?Math.max(0,now-parsed):Number.POSITIVE_INFINITY }

export function evaluateQueueHealth(input:{workItems:WorkItem[];now?:Date;thresholds?:Partial<QueueHealthThresholds>}):QueueHealthReport {
  const checkedAt=input.now??new Date(); const now=checkedAt.getTime(); const thresholds={...defaults,...input.thresholds}; const active=input.workItems.filter(item=>!terminal.has(item.state)); const issues:QueueHealthIssue[]=[]
  const providers=[...new Set(active.map(item=>item.provider))].sort().map(provider=>{
    const items=active.filter(item=>item.provider===provider); const queued=items.filter(item=>item.state==='queued'); const processing=items.filter(item=>['leased','processing','verification_pending'].includes(item.state)); const oldestAgeMs=queued.reduce((max,item)=>Math.max(max,age(item,now)),0); const stuckItems=processing.filter(item=>age(item,now)>thresholds.processingStaleMs).length
    if(queued.length>=thresholds.criticalDepth) issues.push({code:'queue_backlog',severity:'critical',provider,subject:provider,value:queued.length}); else if(queued.length>=thresholds.warningDepth) issues.push({code:'queue_backlog',severity:'warning',provider,subject:provider,value:queued.length})
    if(oldestAgeMs>=thresholds.criticalAgeMs) issues.push({code:'queue_starvation',severity:'critical',provider,subject:provider,value:oldestAgeMs}); else if(oldestAgeMs>=thresholds.warningAgeMs) issues.push({code:'queue_starvation',severity:'warning',provider,subject:provider,value:oldestAgeMs})
    if(stuckItems) issues.push({code:'stuck_work_item',severity:'critical',provider,subject:provider,value:stuckItems})
    const own=issues.filter(issue=>issue.provider===provider); return {provider,status:(own.some(issue=>issue.severity==='critical')?'critical':own.length?'degraded':'healthy') as QueueHealthStatus,depth:queued.length,oldestAgeMs,stuckItems}
  })
  const critical=issues.filter(issue=>issue.severity==='critical').length; const warnings=issues.length-critical
  return { status:critical?'critical':warnings?'degraded':'healthy', score:Math.max(0,100-critical*25-warnings*10), checkedAt:checkedAt.toISOString(), totals:{queued:active.filter(item=>item.state==='queued').length,processing:active.filter(item=>['leased','processing','verification_pending'].includes(item.state)).length,stuck:providers.reduce((sum,p)=>sum+p.stuckItems,0),providers:providers.length}, providers, issues, schemaVersion:'supervisor-queue-health-v1' }
}
