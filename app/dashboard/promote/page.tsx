import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function PromoteBusinessPage() {
  return <CockpitModulePage module={getModuleByKey('promote')!} primaryActionKey="promote.primaryAction" checklistPrefix="promote.checklist" previewPrefix="promote.preview" />
}
