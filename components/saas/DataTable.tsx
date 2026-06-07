import type React from 'react'

export type DataTableColumn<T> = {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
}

export function DataTable<T extends { id: string }>({ title, description, columns, rows }: { title: string; description: string; columns: DataTableColumn<T>[]; rows: T[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.04]">
      <div className="border-b border-white/10 p-5">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm text-white/55">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-black/40 text-xs uppercase tracking-[0.2em] text-white/45">
            <tr>
              {columns.map((column) => <th key={String(column.key)} className="px-5 py-4 font-bold">{column.header}</th>)}
              <th className="px-5 py-4 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.id} className="text-white/75 transition hover:bg-white/[.03]">
                {columns.map((column) => (
                  <td key={String(column.key)} className="px-5 py-4">
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? '')}
                  </td>
                ))}
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <button className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70">Edit</button>
                    <button className="rounded-full border border-rose-300/20 px-3 py-1 text-xs font-bold text-rose-200">Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
