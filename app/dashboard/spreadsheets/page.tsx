import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function SpreadsheetsPage() {
  return <CockpitModulePage module={getModuleByKey('spreadsheets')!} primaryActionKey="spreadsheets.primaryAction" checklistPrefix="spreadsheets.checklist" previewPrefix="spreadsheets.preview" />
}
