<button
  onClick={() => setOpen(true)}
  style={{
    position: 'fixed',
    right: 30,
    bottom: 30,
    zIndex: 999999,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 18px',
    borderRadius: 999,
    background:
      'linear-gradient(135deg,#ffc300,#ff9500)',
    color: '#111',
    fontSize: 16,
    fontWeight: 800,
    boxShadow: '0 10px 35px rgba(0,0,0,.35)',
  }}
>
  <span style={{ fontSize: 26 }}>✨</span>
  <span>AI Concierge</span>
</button>
