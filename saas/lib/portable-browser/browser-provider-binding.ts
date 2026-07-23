import type { BrowserProviderAdapter } from '../browser-provider/provider-adapter.ts'
import type { PortableBrowserAdapterDescriptor } from './browser-adapter-descriptor.ts'
export interface PortableBrowserProviderBinding { browserProviderId:string; portableAdapterId:string; metadataOnly:true }
export function bindBrowserProviderMetadata(provider:BrowserProviderAdapter, descriptor:PortableBrowserAdapterDescriptor):PortableBrowserProviderBinding { return Object.freeze({browserProviderId:provider.providerId,portableAdapterId:descriptor.adapterId,metadataOnly:true}) }
