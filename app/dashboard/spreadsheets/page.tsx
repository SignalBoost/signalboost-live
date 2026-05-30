import CockpitModulePage from '@/components/dashboard/CockpitModulePage'
import { getModuleByKey } from '@/lib/platform/unifiedPlatform'

export default function SpreadsheetsPage() {
  return (
    <CockpitModulePage
      module={getModuleByKey('spreadsheets')!}
      primaryAction="Import data"
      checklist={['Log spreadsheet import', 'Normalize columns and consent fields', 'Map rows to leads, reviews, or bookings', 'Route approved rows into Outreach']}
      preview={['CSV intake grid for contacts, customers, bookings, and KPIs', 'Column-mapping assistant for multilingual headers', 'CRM status, consent, and source-url checks', 'KPI rollups for Admin Console telemetry']}
    />
  )
}
