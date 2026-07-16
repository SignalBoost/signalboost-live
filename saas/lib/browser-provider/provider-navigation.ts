import type { OriginId } from './provider-origin.ts'
export type NavigationId='deployment-list'|'deployment-detail'|'project-settings'|'domains'|'environment-metadata'|'logs'
export interface NavigationProfile { id:NavigationId; origin:OriginId; pathTemplate:string; readOnly:true; schemaVersion:'1.0.0' }
export function createNavigationRegistry(items:readonly NavigationProfile[]){ const values=[...items].sort((a,b)=>a.id.localeCompare(b.id)).map(Object.freeze); const map=new Map(values.map(x=>[x.id,x])); return Object.freeze({get(id:NavigationId){const v=map.get(id);if(!v)throw new Error('unknown_navigation');return v},list(){return [...values]}}) }
