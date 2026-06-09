export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 64, fontWeight: 900, color: '#ffc300', lineHeight: 1 }}>404</div>
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 16 }}>Page not found</p>
      <a href="/dashboard" style={{ color: '#1af0ff', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
        ← Back to dashboard
      </a>
    </div>
  )
}
