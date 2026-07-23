export interface PortableBrowserTelemetryPort { emit(event:{tenantId:string; name:string; attributes:Readonly<Record<string,string|number|boolean>>}):Promise<void> }
