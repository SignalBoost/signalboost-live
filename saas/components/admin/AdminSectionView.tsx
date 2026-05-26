import { AdminSectionConfig } from '@/lib/admin/sections'

export default function AdminSectionView({ section }: { section: AdminSectionConfig }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
        <p className="text-slate-400 mt-1">{section.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {section.metrics.map(metric => (
          <div key={metric.key} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">{metric.label}</p>
            <p className="text-xl font-semibold text-white mt-2">{metric.value ?? 'Not tracked yet'}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-medium">{section.tableTitle}</h3>
          <div className="text-xs text-slate-400">Filters: date range • product • country • plan</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-300"><tr>{section.tableColumns.map(c => <th key={c} className="text-left px-4 py-3">{c}</th>)}</tr></thead>
          <tbody>
            <tr className="border-t border-slate-800"><td colSpan={section.tableColumns.length} className="px-4 py-8 text-slate-400">Not tracked yet. Connect this panel to analytics tables/events when available.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
