import type { PortableBrowserHumanControlPort } from '../browser-human-control-port.ts'
export class FakeHumanControlPort implements PortableBrowserHumanControlPort { async createLiveView(){return {liveViewReference:'view'}} async requestTakeover(){return {takeoverReference:'takeover'}} async status(){return 'released' as const} async resumeAfterRelease(){} async closeLiveView(){} }
