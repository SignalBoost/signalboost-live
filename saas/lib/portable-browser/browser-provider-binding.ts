// saas/lib/portable-browser/browser-provider-binding.ts
//
// THE LAST ESCAPE OUT OF THE PORTABLE, AND IT COST ONE STRING.
//
// This file imported `BrowserProviderAdapter` from lib/browser-provider/, which lives outside
// the portable and pulls nine further modules behind it — capability, errors, evidence, health,
// navigation, origin, selector, verification, version. All nine were being dragged onto the
// buyer surface, and none of them would be in the archive the packager produces, so a buyer's
// install would have failed at startup.
//
// What the function actually uses from that whole subsystem is `provider.providerId`. One
// string.
//
// So the parameter is now typed by what it NEEDS rather than by what a caller happens to pass.
// TypeScript is structural: every existing caller still passes a full BrowserProviderAdapter and
// still compiles, unchanged. The portable simply stops asserting that a buyer must own our
// provider subsystem in order to record which of their adapters maps to which of their
// providers.
//
// The general rule this is an instance of, worth applying wherever a portable reaches outward:
// IMPORT THE SHAPE YOU USE, NOT THE TYPE YOU WERE GIVEN. A wide type imported for one field is
// a dependency on everything behind it.

import type { PortableBrowserAdapterDescriptor } from './browser-adapter-descriptor.ts'

/**
 * The minimum a provider must expose to be bound to a portable adapter.
 *
 * Deliberately structural and deliberately tiny. A host's own provider type satisfies it
 * without importing anything from here, and a buyer with no provider subsystem at all can
 * satisfy it with an object literal.
 */
export interface BindableBrowserProvider {
  readonly providerId: string
}

export interface PortableBrowserProviderBinding {
  browserProviderId: string
  portableAdapterId: string
  /**
   * Always true, and stated in the record rather than in documentation. This binding is a
   * NAME-TO-NAME association and nothing more — it grants no capability, carries no
   * credential, and authorises no session. Anything reading it should be unable to mistake it
   * for a connection.
   */
  metadataOnly: true
}

export function bindBrowserProviderMetadata(
  provider: BindableBrowserProvider,
  descriptor: PortableBrowserAdapterDescriptor,
): PortableBrowserProviderBinding {
  return Object.freeze({
    browserProviderId: provider.providerId,
    portableAdapterId: descriptor.adapterId,
    metadataOnly: true,
  })
}
