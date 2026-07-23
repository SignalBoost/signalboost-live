import type { PortableBrowserApprovalPort } from '../browser-approval-port.ts'
export const denyAllBrowserApprovalPort:PortableBrowserApprovalPort={request:async()=>({approvalReference:'denied',approved:false}),status:async()=> 'denied'}
