export type PortableBrowserResult<T> = Readonly<{ok:true; value:T}>|Readonly<{ok:false; code:string}>
export const browserOk=<T>(value:T):PortableBrowserResult<T>=>Object.freeze({ok:true,value})
export const browserFail=(code:string):PortableBrowserResult<never>=>Object.freeze({ok:false,code})
