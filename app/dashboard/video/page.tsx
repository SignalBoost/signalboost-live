import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function VideoPage() {
  return <CockpitModulePage module={getModuleByKey('video')!} primaryActionKey="video.primaryAction" checklistPrefix="video.checklist" previewPrefix="video.preview" />
}
