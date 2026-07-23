export class PortableBrowserRuntimeError extends Error { constructor(public readonly code:string){super(code);this.name='PortableBrowserRuntimeError'} }
