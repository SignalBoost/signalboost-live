import type { AndroidPackagingDescriptor } from './android-packaging.ts'

export const ANDROID_SCAFFOLD_SCHEMA_VERSION = 'signalboost-android-scaffold-v1' as const

export interface AndroidScaffoldPlan {
  schemaVersion: typeof ANDROID_SCAFFOLD_SCHEMA_VERSION
  portableId: string
  packageName: string
  shell: 'twa'
  files: Readonly<Record<string, string>>
  state: 'scaffold_ready'
  unsigned: true
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

const FORBIDDEN = /BEGIN\s|PRIVATE\s+KEY|keystore|storePassword|keyPassword|signingConfigs|exec\(|spawn\(|child_process/i

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function createUnsignedAndroidScaffold(descriptor: AndroidPackagingDescriptor): AndroidScaffoldPlan {
  if (descriptor.shell !== 'twa') throw new Error('unsigned scaffold v1 supports TWA descriptors only')
  if (descriptor.state !== 'metadata_ready' && descriptor.state !== 'build_ready') {
    throw new Error('unsigned scaffold requires metadata_ready or build_ready state')
  }
  if (descriptor.signing.productionKeyConfigured || descriptor.signing.keyReference) {
    throw new Error('unsigned scaffold rejects signing configuration')
  }
  if (descriptor.distribution.playConsoleAppCreated || descriptor.distribution.internalTestingPublished || descriptor.distribution.productionPublished) {
    throw new Error('unsigned scaffold rejects publication claims')
  }

  const host = new URL(descriptor.launchUrl).host
  const files: Record<string, string> = {
    'settings.gradle.kts': `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = "${descriptor.portableId}-android"\ninclude(":app")\n`,
    'build.gradle.kts': `plugins { id("com.android.application") version "8.7.3" apply false }\n`,
    'app/build.gradle.kts': `plugins { id("com.android.application") }\n\nandroid {\n  namespace = "${descriptor.packageName}"\n  compileSdk = 35\n  defaultConfig { applicationId = "${descriptor.packageName}"; minSdk = 23; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }\n}\n\ndependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.6.2") }\n`,
    'app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="${escapeXml(descriptor.appName)}" android:allowBackup="false"><activity android:name="com.google.androidbrowserhelper.trusted.LauncherActivity" android:exported="true"><meta-data android:name="android.support.customtabs.trusted.DEFAULT_URL" android:value="${escapeXml(descriptor.launchUrl)}"/><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>\n`,
    'assetlinks/README.md': `Publish Digital Asset Links at https://${host}/.well-known/assetlinks.json only after the buyer supplies the release certificate fingerprint. No fingerprint or signing material is stored in this scaffold.\n`,
    'README.md': `# ${descriptor.appName} Android scaffold\n\nDeterministic unsigned TWA project text. No Gradle command has run. No APK or AAB exists. No signing configuration is present. No Play Console submission has occurred.\n`,
  }
  for (const [path, content] of Object.entries(files)) {
    if (FORBIDDEN.test(content)) throw new Error(`unsafe scaffold content rejected: ${path}`)
  }

  return Object.freeze({
    schemaVersion: ANDROID_SCAFFOLD_SCHEMA_VERSION,
    portableId: descriptor.portableId,
    packageName: descriptor.packageName,
    shell: 'twa',
    files: Object.freeze(files),
    state: 'scaffold_ready',
    unsigned: true,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}
