import type { PortableBrowserTelemetryPort } from '../browser-telemetry-port.ts'
export class InMemoryBrowserTelemetryPort implements PortableBrowserTelemetryPort { events:any[]=[]; async emit(event:any){this.events.push(event)} }
