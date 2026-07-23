import type { PortableBrowserEvidencePort } from '../browser-evidence-port.ts'
export class InMemoryBrowserEvidencePort implements PortableBrowserEvidencePort { records:string[]=[]; async record(input:any){this.records.push(input.referenceId);return {evidenceReference:input.referenceId}} async replay(reference:string){return {replayReference:reference}} }
