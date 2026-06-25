@@ imports
 import { useI18n } from '@/components/i18n/I18nProvider'
+import { t } from '@/lib/i18n/t'
@@ badge + subhead
-  const badge = hero.badge ?? 'Build · Review · Broadcast'
-  const subhead =
-    hero.subhead ??
-    'Create your website, collect customer reviews, and produce native audio & video content — in your language, not a translation.'
+  const badge = t(dict, 'home.hero.marquee', 'Audit · Build · Review · Broadcast')
+  const subhead = t(
+    dict,
+    'home.hero.subtitle',
+    'SignalBoost continuously audits your repositories and infrastructure, traces vulnerabilities to their source, and maps your posture to SOC 2, ISO 27001, NIST, and CIS — automatically.'
+  )
@@ feature bar (prepend, originals untouched)
   const features = [
+    { icon: '🛡️', label: t(dict, 'home.features.audit', 'Repository audits') },
     { icon: '🌐', label: hero?.features?.site ?? 'Site builder' },
     { icon: '⭐', label: hero?.features?.reviews ?? 'Review collector' },
     { icon: '🎙️', label: hero?.features?.audio ?? 'Native audio' },
     { icon: '🎬', label: hero?.features?.video ?? 'Video editor' },
   ]
@@ rotating-headline source (machinery preserved; content → title)
     const fallback = [
-      'Build your brand in English',
-      'Construa sua marca em Português',
-      'Construye tu marca en Español',
-      'Twórz swoją markę po Polsku',
-      'Создайте свой бренд на Русском',
+      t(dict, 'home.hero.title', 'Audit every repo. Trace every vulnerability. Map every control.'),
     ]
