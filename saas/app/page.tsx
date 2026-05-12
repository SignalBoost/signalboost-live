export default function HomePage() {
  return (
    <div className="site-frame">
      <header className="site-nav">
        <div className="brand">SignalBoost</div>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="/dashboard">Dashboard</a>
        </nav>

        <div className="nav-actions">
          <select aria-label="Language">
            <option>EN</option>
            <option>ES</option>
            <option>PT</option>
            <option>PL</option>
            <option>RU</option>
          </select>

          <button className="theme-button" type="button">
            🌙
          </button>

          <a className="login-dot" href="/dashboard">
            ▲
          </a>
        </div>
      </header>

      <main className="page" id="home">
        <section className="app-shell">
          <section className="hero">
            <div>
              <span className="eyebrow">⚡ AI review content engine</span>

              <h1>Turn your reviews into content</h1>

              <p>
                Transform customer reviews into branded graphics and voice ads
                with one powerful dashboard.
              </p>

              <div className="hero-buttons">
                <a className="btn btn-primary" href="/dashboard">
                  Generate a Voice Ad
                </a>

                <a className="btn btn-secondary" href="/dashboard">
                  Turn Reviews into Graphics
                </a>

                <a className="btn btn-secondary" href="#how-it-works">
                  See How It Works
                </a>
              </div>

              <div className="trust-row">
                <span>Trusted by:</span>
                <span className="logo-word shopify">shopify</span>
                <span className="logo-word meta">∞ Meta</span>
                <span className="logo-word yelp">yelp★</span>
              </div>
            </div>

            <div className="preview-wrap">
              <div className="preview-card">
                <span className="preview-badge">Generated Content</span>

                <div className="review-box">
                  <div className="stars">★★★★★</div>
                  <p className="review-quote">
                    “Amazing results! Our sales skyrocketed.”
                  </p>
                </div>

                <div className="promo">
                  <div>
                    <h3>SUMMER SALE</h3>
                    <p>50% OFF</p>
                  </div>
                </div>

                <div className="audio-bar" aria-label="Demo voice ad player">
                  <span className="play">▶</span>
                  <span className="wave"></span>
                  <span className="volume">🔊</span>
                </div>
              </div>
            </div>
          </section>

          <section className="activity">
            <h2>See SignalBoost in Action</h2>

            <div className="activity-grid">
              <div className="activity-card quote-card">
                <div className="stars">★★★★★</div>
                <p>“Fast, professional, easy from start to finish.”</p>
              </div>

              <div className="activity-card audio-card">
                <div className="mic">🎙️</div>

                <div>
                  <strong>Engaging Voice Ad Created!</strong>
                  <p>Ready in seconds</p>
                  <div className="mini-wave"></div>
                </div>
              </div>

              <div className="activity-card chart-card">
                <strong>1,200+ Plays</strong>
                <p>This week</p>

                <div className="chart-line">
                  <svg viewBox="0 0 220 55" aria-hidden="true">
                    <polyline
                      points="0,45 35,35 70,40 105,24 140,30 175,15 220,9"
                      fill="none"
                      stroke="#facc15"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <g fill="#facc15">
                      <circle cx="35" cy="35" r="4" />
                      <circle cx="105" cy="24" r="4" />
                      <circle cx="175" cy="15" r="4" />
                      <circle cx="220" cy="9" r="4" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="sections">
          <section id="how-it-works" className="section-card">
            <h2>How it works</h2>
            <p>
              Paste a review, choose a format, and generate polished content
              instantly.
            </p>
          </section>

          <section id="features" className="section-card">
            <h2>Features</h2>
            <p>
              Branded graphics, voice ads, secure media storage, and
              multilingual output.
            </p>
          </section>

          <section id="pricing" className="section-card">
            <h2>Pricing</h2>
            <p>
              Starter and Pro plans for local businesses, creators, and growing
              brands.
            </p>
          </section>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </div>

        © 2026 SignalBoost. All rights reserved.
      </footer>
    </div>
  );
}
