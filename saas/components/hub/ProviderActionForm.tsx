// Renders the data payload returned by a Hub action. Auto-detects the first
// array in the payload (products, prices, users, keys, env vars, accounts,
// repos, rows, …) and renders it as a readable table; falls back to key/value
// rows for scalar payloads, and to formatted JSON for anything unusual.
function ResultView({ data }: { data: any }) {
  if (data === null || data === undefined) return null

  // SQL editor / generic row arrays
  const arrayKey = data && typeof data === 'object'
    ? Object.keys(data).find(k => Array.isArray((data as any)[k]) && (data as any)[k].length > 0)
    : null

  if (arrayKey) {
    const rows: any[] = (data as any)[arrayKey]
    const first = rows[0]
    
    // Array of objects -> structured responsive table
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const colSet = new Set<string>()
      rows.slice(0, 100).forEach((r: any) => Object.keys(r || {}).forEach(k => colSet.add(k)))
      const cols: string[] = Array.from(colSet).slice(0, 6)
      
      return (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {cols.map(col => (
                  <th key={col} style={{ textAlign: 'left', padding: '10px 12px', position: 'sticky', top: 0, background: 'rgba(8,11,20,.98)', color: '#1af0ff', fontWeight: 700, fontSize: 10, letterSpacing: '.03em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,.12)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', background: i % 2 ? 'rgba(255,255,255,.02)' : 'transparent' }}>
                  {cols.map(col => {
                    const valueString = formatCell(row?.[col])
                    // Dynamic highlight tracking for IDs, Primary Names, and Cents fields
                    const isPrimaryColumn = col === 'name' || col === 'label' || col === 'id' || col === 'unit_amount'
                    
                    return (
                      <td 
                        key={col} 
                        title={valueString} 
                        style={{ 
                          padding: '10px 12px', 
                          color: isPrimaryColumn ? '#fff' : 'rgba(26,240,255,.82)', 
                          fontWeight: isPrimaryColumn ? 700 : 400, 
                          fontFamily: isPrimaryColumn ? 'inherit' : 'ui-monospace, SFMono-Regular, Menlo, monospace', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis' 
                        }}
                      >
                        {col === 'unit_amount' && typeof row?.[col] === 'number'
                          ? (row[col] / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
                          : valueString}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    
    // Array of scalars -> simple list
    return (
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10, minHeight: 0 }}>
        {rows.slice(0, 100).map((v: any, i: number) => (
          <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,.82)', fontFamily: 'ui-monospace, monospace', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>{formatCell(v)}</div>
        ))}
      </div>
    )
  }

  // Reveal-style single value
  if (data && typeof data === 'object' && typeof (data as any).value === 'string') {
    return (
      <div style={{ flex: 1, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'rgba(26,240,255,.85)', wordBreak: 'break-all' }}>
        {(data as any).value}
      </div>
    )
  }

  // Scalar key/value object
  if (data && typeof data === 'object') {
    const entries = Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    if (entries.length > 0) {
      return (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{k}</span>
              <span style={{ color: 'rgba(255,255,255,.85)', fontFamily: 'ui-monospace, monospace', textAlign: 'right', wordBreak: 'break-all' }}>{formatCell(v)}</span>
            </div>
          ))}
        </div>
      )
    }
  }

  // Fallback: pretty JSON
  return (
    <div style={{ flex: 1, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 320 }}>
      {JSON.stringify(data, null, 2)}
    </div>
  )
}
