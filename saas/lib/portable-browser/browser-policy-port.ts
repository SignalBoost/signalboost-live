import type { PortableBrowserAction, PortableBrowserTenantScope } from './browser-runtime-types.ts'
export interface PortableBrowserPolicyPort { authorize(scope:PortableBrowserTenantScope, action:PortableBrowserAction):Promise<{allowed:boolean; reason?:string}> }
