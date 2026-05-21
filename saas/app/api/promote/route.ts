<div
  style={{
    marginLeft: 'auto',
    display: 'flex',
    gap: 10
  }}
>
  <button
    onClick={handleReset}
    style={{
      border: '1px solid rgba(255,255,255,.15)',
      borderRadius: 999,
      padding: '13px 18px',
      background: 'rgba(255,255,255,.06)',
      color: '#fff',
      fontWeight: 800,
      cursor: 'pointer'
    }}
  >
    Reset
  </button>

  <button
    onClick={handleGenerate}
    disabled={loading}
    style={{
      border: 'none',
      borderRadius: 999,
      padding: '13px 20px',
      background: GOLD,
      color: '#000',
      fontWeight: 900,
      cursor: loading
        ? 'not-allowed'
        : 'pointer',
      opacity: loading ? .7 : 1,
      boxShadow: '0 18px 40px rgba(255,195,0,.20)'
    }}
  >
    {loading
      ? ui.generating
      : t(
          dict,
          'promote_page.generate',
          'Generate campaign'
        )}
  </button>
</div>
