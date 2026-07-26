// saas/portable-mobile/provider-hub.android.ts
import { createAndroidPackagingDescriptor } from './android-packaging.ts'

export const providerHubAndroidPackaging = createAndroidPackagingDescriptor({
  portableId: 'provider-hub',
  appName: 'SignalBoost Provider Hub',
  packageName: 'com.signalboost.providerhub',
  shell: 'twa',
  launchUrl: 'https://signalboostapp.com/dashboard/provider-hub',
  displayMode: 'standalone',
  orientation: 'any',
  icons: [
    { src: '/icons/provider-hub-192.svg', sizes: '192x192', purpose: 'any' },
    { src: '/icons/provider-hub-512-maskable.svg', sizes: '512x512', purpose: 'maskable' },
  ],
  state: 'build_ready',
  signing: { productionKeyConfigured: false },
  distribution: {
    playConsoleAppCreated: false,
    internalTestingPublished: false,
    productionPublished: false,
  },
  notices: [
    'Build-readiness assets and validation only',
    'Digital Asset Links fingerprint remains a release-owner substitution',
    'No Android bundle has been generated or signed',
    'No Play Console publication has occurred',
    'Authenticated web functionality remains the source of truth',
  ],
})
