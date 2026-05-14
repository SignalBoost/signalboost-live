export const metadata = {
  title: "SignalBoost — Turn Reviews Into Content",
  description:
    "SignalBoost transforms customer reviews into branded graphics and voice ads from one simple dashboard.",
};

export default function HomePage() {
  return (
    <main>
      <div className="site-frame">
        <header className="site-nav">
          <div className="brand">SignalBoost</div>

          <nav className="nav-links">
            <a href="#home">Home</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#login">Login</a>
          </nav>

          <div className="nav-actions">
            <select aria-label="Language" defaultValue="EN">
              <option>EN</option>
              <option>ES</option>
              <option>PT</option>
              <option>PL</option>
              <option>RU</option>
            </select>
            <button className="theme-button" type="button">
              🌙
            </button>
            <span className="login-dot">▲</span>
          </div>
        </header>

        <div className="page" id="home">
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
                  <button className="btn btn-primary" type="button">
                    Generate a Voice Ad
                  </button>
                  <button className="btn btn-secondary" type="button">
                    Turn Reviews into Graphics
                  </button>
                  <button className="btn btn-secondary" type="button">
                    See How It Works
                  </button>
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
        </div>

        <footer className="footer">
          <div className="footer-links">
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="/contact.html">Contact</a>
          </div>
          © 2026 SignalBoost. All rights reserved.
        </footer>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :root {
          --bg: #eef1f5;
          --shell: #070a0f;
          --surface: #0c1118;
          --surface2: #111722;
          --text: #fff;
          --muted: #a9b3c1;
          --yellow: #f6b91a;
          --yellow2: #ffd34d;
          --border: rgba(255,255,255,.09);
          --goldBorder: rgba(246,185,26,.28);
          --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          min-height: 100vh;
          font-family: var(--font);
          color: var(--text);
          background: linear-gradient(180deg, #f3f5f8, #dfe4eb);
          padding: 24px;
        }

        .site-frame {
          max-width: 1180px;
          margin: 0 auto;
          background:
            radial-gradient(circle at 15% 18%, rgba(246,185,26,.12), transparent 28%),
            radial-gradient(circle at 84% 12%, rgba(59,130,246,.10), transparent 26%),
            var(--shell);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 28px;
          box-shadow: 0 26px 80px rgba(0,0,0,.45);
          overflow: hidden;
        }

        .site-nav {
          height: 54px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 1rem;
          padding: 0 20px;
          background: rgba(5,8,12,.78);
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(14px);
        }

        .brand {
          font-weight: 950;
          font-size: .95rem;
          letter-spacing: -.04em;
        }

        .nav-links {
          display: flex;
          gap: 1.15rem;
          align-items: center;
          justify-content: center;
          font-size: .72rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .nav-links a {
          color: #f8fafc;
          text-decoration: none;
          opacity: .92;
        }

        .nav-links a:hover {
          color: var(--yellow2);
        }

        .nav-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: .45rem;
        }

        select,
        .theme-button,
        .login-dot {
          background: #111827;
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 999px;
          height: 30px;
          font-size: .68rem;
          font-weight: 800;
        }

        select {
          padding: 0 .55rem;
        }

        .theme-button,
        .login-dot {
          width: 30px;
          display: grid;
          place-items: center;
        }

        .login-dot {
          background: rgba(246,185,26,.14);
          color: var(--yellow);
        }

        .page {
          padding: 26px;
        }

        .app-shell {
          background:
            linear-gradient(145deg, rgba(255,255,255,.04), rgba(255,255,255,.01)),
            rgba(8,12,18,.94);
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 24px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0,1.05fr) 390px;
          gap: 28px;
          align-items: center;
          min-height: 330px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: .45rem;
          color: var(--yellow2);
          background: rgba(246,185,26,.12);
          border: 1px solid var(--goldBorder);
          border-radius: 999px;
          padding: .38rem .68rem;
          font-size: .7rem;
          font-weight: 900;
          margin-bottom: 1rem;
        }

        h1 {
          max-width: 520px;
          font-size: clamp(2.7rem, 5.7vw, 4.8rem);
          line-height: .88;
          letter-spacing: -.075em;
          font-weight: 950;
          margin-bottom: 1rem;
        }

        .hero p {
          color: var(--muted);
          max-width: 500px;
          line-height: 1.45;
          font-size: .98rem;
        }

        .hero-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: .62rem;
          margin-top: 1.25rem;
        }

        .btn {
          border: 0;
          border-radius: 999px;
          padding: .72rem .95rem;
          font-size: .78rem;
          font-weight: 950;
          cursor: pointer;
          transition: .18s;
        }

        .btn:hover {
          transform: translateY(-2px);
        }

        .btn-primary {
          background: linear-gradient(180deg, var(--yellow2), var(--yellow));
          color: #181006;
          box-shadow: 0 10px 25px rgba(246,185,26,.16);
        }

        .btn-secondary {
          background: #141b25;
          color: #fff;
          border: 1px solid var(--border);
        }

        .trust-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: .75rem;
          margin-top: 1.45rem;
          color: var(--muted);
          font-size: .78rem;
          font-weight: 800;
        }

        .logo-word {
          color: #e5e7eb;
          opacity: .9;
          font-size: .9rem;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .shopify {
          color: #95bf47;
        }

        .meta {
          color: #8fb6ff;
        }

        .yelp {
          color: #ff5a5f;
        }

        .preview-wrap {
          display: grid;
          place-items: center;
        }

        .preview-card {
          width: 100%;
          background:
            linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
            var(--surface2);
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 24px 58px rgba(0,0,0,.36);
          position: relative;
          overflow: hidden;
        }

        .preview-card:before {
          content: "";
          position: absolute;
          inset: -1px;
          background: radial-gradient(circle at 70% 0%, rgba(246,185,26,.16), transparent 35%);
          pointer-events: none;
        }

        .preview-card > * {
          position: relative;
          z-index: 1;
        }

        .preview-badge {
          display: block;
          color: #dbe3ef;
          font-size: .78rem;
          font-weight: 950;
          margin-bottom: .9rem;
        }

        .review-box {
          background: #0b111a;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px;
          padding: .8rem;
          margin-bottom: .8rem;
        }

        .stars {
          color: var(--yellow2);
          letter-spacing: .08em;
          font-size: .9rem;
          margin-bottom: .35rem;
        }

        .review-quote {
          color: #e7edf7;
          font-size: .76rem;
          line-height: 1.35;
          margin: 0;
        }

        .promo {
          min-height: 150px;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          align-items: flex-end;
          background: linear-gradient(90deg, rgba(230,91,18,.97), rgba(255,171,53,.84)), #1a1a1a;
          margin-bottom: .75rem;
          position: relative;
          overflow: hidden;
        }

        .promo:after {
          content: "";
          position: absolute;
          right: 18px;
          bottom: 0;
          width: 112px;
          height: 138px;
          border-radius: 70px 70px 20px 20px;
          background:
            radial-gradient(circle at 50% 20%, #ffe6d1 0 16%, transparent 17%),
            linear-gradient(180deg, #f7f7f7 0 42%, #f97316 43% 100%);
          box-shadow: 0 0 0 8px rgba(255,255,255,.12);
        }

        .promo h3 {
          font-size: 1.72rem;
          line-height: .88;
          letter-spacing: -.06em;
          text-shadow: 0 2px 12px rgba(0,0,0,.35);
        }

        .promo p {
          color: #fff;
          font-size: 1.55rem;
          font-weight: 950;
          margin-top: .15rem;
          text-shadow: 0 2px 12px rgba(0,0,0,.35);
        }

        .audio-bar {
          height: 34px;
          background: #0a0f16;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 999px;
          display: grid;
          grid-template-columns: 28px 1fr 28px;
          align-items: center;
          gap: .55rem;
          padding: 0 .55rem;
        }

        .play {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(246,185,26,.18);
          color: var(--yellow2);
          display: grid;
          place-items: center;
          font-size: .68rem;
        }

        .wave {
          height: 5px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--yellow) 0 38%, rgba(255,255,255,.12) 38% 100%);
          position: relative;
        }

        .wave:after {
          content: "";
          position: absolute;
          left: 38%;
          top: 50%;
          width: 10px;
          height: 10px;
          background: #fff;
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .volume {
          font-size: .8rem;
          color: var(--muted);
        }

        .activity {
          margin-top: 24px;
          border-top: 1px solid var(--border);
          padding-top: 18px;
        }

        .activity h2 {
          font-size: 1rem;
          letter-spacing: -.03em;
          margin-bottom: 12px;
        }

        .activity-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
        }

        .activity-card {
          min-height: 112px;
          background:
            linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.015)),
            var(--surface2);
          border: 1px solid var(--border);
          border-radius: 17px;
          padding: 14px;
          overflow: hidden;
          box-shadow: 0 16px 35px rgba(0,0,0,.20);
        }

        .activity-card p {
          color: var(--muted);
          font-size: .76rem;
          line-height: 1.35;
          margin-top: .35rem;
          font-weight: 750;
        }

        .activity-card strong {
          display: block;
          font-size: .95rem;
          line-height: 1.1;
        }

        .quote-card {
          background:
            linear-gradient(135deg, rgba(246,185,26,.18), rgba(255,255,255,.02)),
            var(--surface2);
        }

        .audio-card {
          display: grid;
          grid-template-columns: 54px 1fr;
          gap: .85rem;
          align-items: center;
        }

        .mic {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(246,185,26,.20), rgba(246,185,26,.06));
          display: grid;
          place-items: center;
          font-size: 1.45rem;
          border: 1px solid var(--goldBorder);
        }

        .mini-wave {
          margin-top: .7rem;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--yellow) 0 45%, rgba(255,255,255,.12) 45% 100%);
        }

        .chart-card {
          position: relative;
        }

        .chart-line {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 15px;
          height: 42px;
        }

        .chart-line svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .sections {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-top: 18px;
        }

        .section-card {
          background: rgba(17,23,34,.86);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 18px;
        }

        .section-card h2 {
          font-size: 1rem;
          margin-bottom: .45rem;
        }

        .section-card p {
          color: var(--muted);
          font-size: .82rem;
          line-height: 1.45;
        }

        .footer {
          text-align: center;
          color: var(--muted);
          padding: 20px 1rem 24px;
          font-size: .78rem;
        }

        .footer-links {
          margin-bottom: 8px;
        }

        .footer-links a {
          color: #f6b91a;
          text-decoration: none;
          margin: 0 8px;
        }

        @media (max-width: 900px) {
          body {
            padding: 12px;
          }

          .site-nav {
            grid-template-columns: 1fr auto;
          }

          .nav-links {
            display: none;
          }

          .hero,
          .activity-grid,
          .sections {
            grid-template-columns: 1fr;
          }

          .hero {
            min-height: auto;
          }

          .preview-card {
            max-width: 430px;
          }
        }

        @media (max-width: 560px) {
          .site-frame {
            border-radius: 20px;
          }

          .page {
            padding: 14px;
          }

          .app-shell {
            padding: 16px;
            border-radius: 18px;
          }

          h1 {
            font-size: 2.75rem;
          }

          .hero-buttons {
            flex-direction: column;
          }

          .btn {
            width: 100%;
          }

          .promo {
            min-height: 128px;
          }

          .promo:after {
            width: 92px;
            height: 116px;
            right: 10px;
          }
        }
      `}</style>
    </main>
  );
}
