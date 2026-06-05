return (
    <>
      <style>{`
        .sbnav-desktop { display: flex; align-items: center; gap: 18px; }
        .sbnav-right { display: flex; align-items: center; gap: 10px; }
        .sbnav-burger { display: none; }
        .sbnav-row { transition: background .15s ease; border-radius: 12px; }
        .sbnav-row:hover { background: var(--surface-1-hover); }
        @media (max-width: 1200px) {
          .sbnav-desktop, .sbnav-right { display: none !important; }
          .sbnav-burger { display: inline-flex !important; }
        }
      `}</style>

      <nav ref={navRef} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, rgba(8,10,20,.86), rgba(15,23,42,.62))',
        borderBottom: '1px solid rgba(26,240,255,.16)',
        boxShadow: '0 18px 60px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.08)',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <canvas ref={canvasRef} style={{ width: 40, height: 40 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="sbnav-desktop">
          <Link href="/" style={{ ...trigger(pathname === '/'), display: 'inline-flex' }}>Home</Link>
          <Group id="website" label="Website" items={WEBSITE} width={340} />
          <Group id="podcast" label="Podcast" items={PODCAST} width={320} />
          <Group id="content" label="Content" items={CONTENT} width={320} />
          <Group id="launchpad" label="Launchpad" items={LAUNCHPAD} width={320} />
          <Group id="grow" label="Grow" items={GROW} width={320} />
          <Group id="workspace" label="Workspace" items={isOwner ? [...WORKSPACE, { icon: '👥', label: 'Team & Roles', href: '/dashboard/team', desc: 'Add people and set their access.' }] : WORKSPACE} width={320} />
          {isAdmin && <Group id="admin" label="Admin" items={ADMIN} cols={2} width={420} />}
          <Link href="/pricing" style={{ ...trigger(pathname === '/pricing'), display: 'inline-flex' }}>Pricing</Link>
          <Group id="help" label="Help" items={HELP} align="right" width={220} />
        </div>

        {/* Desktop right cluster */}
        <div className="sbnav-right">
          <select value={lang} onChange={e => setLang(e.target.value)} style={{
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-medium)', borderRadius: 999,
            padding: '8px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          {user && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>{planLabel}</span>
              {displayName && (
                <span title={displayName} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              )}
            </span>
          )}

          {user ? (
            <button onClick={handleLogout} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 800, cursor: 'pointer' }}>
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>

        {/* Mobile burger */}
        <button className="sbnav-burger" aria-label="Menu" onClick={() => setMobileOpen(o => !o)} style={{ background: 'transparent', border: '1px solid var(--border-soft)', borderRadius: 10, color: '#fff', padding: '8px 12px', cursor: 'pointer', fontSize: 18 }}>
          {mobileOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile panel */}
      {mobileOpen && (
        <div style={{ position: 'sticky', top: 65, zIndex: 99, background: 'rgba(8,10,20,.98)', borderBottom: '1px solid var(--border-medium)', padding: 16, maxHeight: '80vh', overflowY: 'auto', backdropFilter: 'blur(12px)' }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>⚡ {credits}</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999, background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace' }}>{planLabel}</span>
              {displayName && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{displayName}</span>}
            </div>
          )}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <Link href="/" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 14 }}>🏠 Home</Link>
          </div>

          {[
            { title: 'Website', items: WEBSITE },
            { title: 'Podcast', items: PODCAST },
            { title: 'Content', items: CONTENT },
            { title: 'Launchpad', items: LAUNCHPAD },
            { title: 'Grow', items: GROW },
            { title: 'Workspace', items: isOwner ? [...WORKSPACE, { icon: '👥', label: 'Team & Roles', href: '/dashboard/team', desc: 'Add people and set their access.' }] : WORKSPACE },
            ...(isAdmin ? [{ title: 'Admin', items: ADMIN }] : []),
          ].map(section => (
            <div key={section.title} style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
              <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{section.title}</span>
              {section.items.map(item => (
                <Link key={item.href + item.label} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                  <span>{item.icon}</span>{item.label}
                </Link>
              ))}
            </div>
          ))}

          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>More</span>
            <Link href="/pricing" style={{ padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>Pricing</Link>
            {HELP.map(item => (
              <Link key={item.href + item.label} href={item.href} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-medium)', borderRadius: 999, padding: '8px 12px', fontSize: 12 }}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            {user ? (
              <button onClick={handleLogout} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '9px 16px', cursor: 'pointer' }}>{t(dict, 'logout', 'Log out')}</button>
            ) : (
              <button onClick={() => { setMobileOpen(false); setShowAuth(true) }} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 999, padding: '9px 22px', fontWeight: 800, cursor: 'pointer' }}>{t(dict, 'getStarted', 'Get started')}</button>
            )}
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
