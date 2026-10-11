// saas/app/dashboard/cos-university-telemetry/LabCustomerTrainingSection.tsx
// Server-side mount: picks the copy for the page language and renders the client panel.
// In page.tsx, next to <LabExperimentPanel copy={...} />:   <LabCustomerTrainingSection language={language} />
import LabCustomerTrainingPanel from './LabCustomerTrainingPanel'
import { labCustomerTrainingCopy } from '@/lib/i18n/labCustomerTrainingCopy'

export default function LabCustomerTrainingSection({ language }: { language: string }) {
  const code = String(language || 'en').toLowerCase().split(/[-_]/)[0]
  return <LabCustomerTrainingPanel copy={labCustomerTrainingCopy(code)} language={code} />
}
