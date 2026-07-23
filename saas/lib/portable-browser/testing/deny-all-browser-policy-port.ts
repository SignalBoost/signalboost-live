import type { PortableBrowserPolicyPort } from '../browser-policy-port.ts'
export const denyAllBrowserPolicyPort:PortableBrowserPolicyPort={authorize:async()=>({allowed:false,reason:'denied'})}
