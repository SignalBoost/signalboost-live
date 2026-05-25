{promptOpen && (
  <div
    ref={promptRef}
    style={{
      maxHeight: 320,
      overflowY: 'auto',
      padding: 14,
      borderRadius: 12,
      background: 'rgba(0,0,0,0.22)',
      border: '1px solid rgba(255,255,255,0.08)',
      marginTop: 14
    }}
  >
    {promptMessages.map((m, idx) => (
      <div
        key={`${m.role}-${idx}`}
        style={{
          marginBottom: 12,
          display: 'flex',
          justifyContent:
            m.role === 'user'
              ? 'flex-end'
              : 'flex-start',
        }}
      >
        <div
          style={{
            maxWidth: '82%',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            padding: '10px 12px',
            borderRadius: 12,
            background:
              m.role === 'user'
                ? 'rgba(59,130,246,0.18)'
                : 'rgba(255,255,255,0.06)',
            border:
              '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            fontSize: 13,
          }}
        >
          {m.content}
        </div>
      </div>
    ))}

    {promptLoading && (
      <div
        style={{
          color:'rgba(255,255,255,.45)',
          fontSize:13
        }}
      >
        SignalBoost is thinking...
      </div>
    )}
  </div>
)}

{!promptOpen && (
  <div
    style={{
      display:'flex',
      gap:6,
      flexWrap:'wrap',
      marginTop:12
    }}
  >
    {promptSuggestions.map(q=>(
      <button
        key={q}
        onClick={()=>sendPrompt(q)}
        className="terminal-text"
        style={{
          padding:'6px 12px',
          borderRadius:4,
          border:'1px solid rgba(255,255,255,0.05)',
          background:'rgba(0,0,0,0.15)',
          color:'rgba(255,255,255,0.4)',
          fontSize:11,
          cursor:'pointer'
        }}
      >
        {q}
      </button>
    ))}
  </div>
)}
