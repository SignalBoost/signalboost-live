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
    { src: '/icons/provider-hub-192.png', sizes: '192x192', purpose: 'any' },
    { src: '/icons/provider-hub-512-maskable.png', sizes: '512x512', purpose: 'maskable' },
  ],
  state: 'metadata_ready',
  signing: { productionKeyConfigured: false },
  distribution: {
    playConsoleAppCreated: false,
    internalTestingPublished: false,
    productionPublished: false,
  },
  notices: [
    'Packaging metadata only',
    'No Android bundle has been generated or signed',
    'No Play Console publication has occurred',
    'Authenticated web functionality remains the source of truth',
  ],
})
