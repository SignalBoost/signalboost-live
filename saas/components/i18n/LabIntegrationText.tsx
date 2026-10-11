'use client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { labIntegrationUiCopy } from '@/lib/i18n/labIntegrationUiCopy'
export function LabIntegrationText({ id }: { id: string }) {
 const { lang } = useTranslation()
 return <>{labIntegrationUiCopy(lang)[id] ?? id}</>
}
