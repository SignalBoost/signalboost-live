export type SelectorGroup='deployments'|'domains'|'projects'|'logs'|'settings'|'authentication'
export interface ProviderSelector { id:string; group:SelectorGroup; selector:string; readOnly:true; schemaVersion:'1.0.0' }
export function createSelectorRegistry(items:readonly ProviderSelector[]){ const values=[...items].sort((a,b)=>a.id.localeCompare(b.id)).map(Object.freeze); const map=new Map(values.map(x=>[x.id,x])); return Object.freeze({get(id:string){const v=map.get(id);if(!v)throw new Error('unknown_selector');return v},list(){return [...values]}}) }
