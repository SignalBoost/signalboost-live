export interface PortableBrowserSchedulerPort { schedule(input:{tenantId:string; jobId:string; runAt:string}):Promise<{scheduleReference:string}>; cancel(scheduleReference:string):Promise<void> }
