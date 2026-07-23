export interface PortableBrowserCredentialPort { grant(scope:{tenantId:string; credentialPurpose:string}):Promise<{grantReference:string}>; revoke(grantReference:string):Promise<void> }
