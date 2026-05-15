import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-white/5 bg-brand-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-wide text-white">
              SignalBoost <span className="text-brand-blueTag text-xs font-semibold px-2 py-0.5 bg-brand-blueTag/10 rounded-full border border-brand-blueTag/20 ml-1">SaaS</span>
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-brand-muted">
            <a href="#features" className="hover:text-brand-text transition-colors">Features</a>
            <a href="#languages" className="hover:text-brand-text transition-colors">Languages</a>
            <a href="#pricing" className="hover:text-brand-text transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-brand-muted hover:text-brand-text transition-colors">
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-medium bg-brand-accent hover:bg-brand-accentHover text-brand-bg rounded-lg font-semibold transition-all shadow-lg shadow-brand-accent/10">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
            Build Native Multi-Language Platforms{" "}
            <span className="text-brand-blueTag">
              From Scratch with AI
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-brand-muted max-w-3xl mx-auto mb-10 leading-relaxed">
            Not just simple translation layers. Completely build, design, and manage entire landing pages, media assets, localized scripts, and user engagement reviews in 5 native structures simultaneously.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/generator" className="w-full sm:w-auto px-8 py-4 bg-brand-accent hover:bg-brand-accentHover text-brand-bg font-bold rounded-xl transition-all shadow-xl shadow-brand-accent/20 text-center">
              Launch AI Website Generator
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-brand-surface/60 border border-white/5 hover:bg-brand-surface text-brand-text font-semibold rounded-xl transition-colors text-center">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 border-t border-white/5 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Everything needed to launch and run an AI SaaS</h2>
            <p className="text-brand-muted">Generate structural layouts, high-fidelity media pipelines, and full support suites directly within an automated workflow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-brand-surface/40 border border-white/5 hover:border-white/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-brand-blueTag/10 flex items-center justify-center border border-brand-blueTag/20 mb-5 text-brand-blueTag">
                🖥️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Native Web Architecture</h3>
              <p className="text-sm text-brand-muted leading-relaxed">
                Generate semantic HTML/CSS visual frameworks completely optimized for lightning-fast speeds, skipping restrictive iframe elements.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-brand-surface/40 border border-white/5 hover:border-white/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-brand-accent/10 flex items-center justify-center border border-brand-accent/20 mb-5 text-brand-accent">
                🎙️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Synchronized Media Generation</h3>
              <p className="text-sm text-brand-muted leading-relaxed">
                Create voice tracks and video advertisements completely synchronized inside the app dashboard, powered by multi-language neural logic.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-brand-surface/40 border border-white/5 hover:border-white/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-brand-blueTag/10 flex items-center justify-center border border-brand-blueTag/20 mb-5 text-brand-blueTag">
                📊
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Review Management</h3>
              <p className="text-sm text-brand-muted leading-relaxed">
                Analyze public client remarks and auto-generate promotional graphic structures to turn customer reviews into conversions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-Cultural Language Framework Section */}
      <section id="languages" className="py-20 border-t border-white/5 bg-brand-surface/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Deep Cultural Development</h2>
          <p className="text-brand-muted max-w-2xl mx-auto mb-12">
            The platform executes individual developmental flows for 5 key geographical ecosystems directly, respecting formatting, tone, and functional behavior:
          </p>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {["English (US/UK)", "Español", "Português", "Polski", "Русский"].map((lang, index) => (
              <span key={index} className="px-4 py-2 bg-brand-surface border border-white/5 text-brand-text rounded-xl text-sm font-medium shadow-sm">
                🌐 {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Simplified Pricing Tiers */}
      <section id="pricing" className="py-20 border-t border-white/5 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Straightforward Plans</h2>
            <p className="text-brand-muted">Scale the generation requirements as operations grow. Full Stripe checkout ready.</p>
          </div>

          <div className="max-w-md mx-auto grid gap-8 lg:max-w-4xl lg:grid-cols-2">
            {/* Starter Plan */}
            <div className="p-8 rounded-2xl bg-brand-surface/40 border border-white/5 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Starter</h3>
                <p className="text-sm text-brand-muted mb-6">Perfect for building out initial landing pages and concepts.</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-white">$19</span>
                  <span className="text-brand-muted text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-brand-text/90 mb-8">
                  <li className="flex items-center gap-2">✓ Static Website Generation</li>
                  <li className="flex items-center gap-2">✓ Next.js Standard Route exports</li>
                  <li className="flex items-center gap-2">✓ Basic AI Voice processing</li>
                </ul>
              </div>
              <Link href="/signup" className="block w-full py-3 bg-brand-surface border border-white/10 hover:bg-brand-surface/80 text-brand-text font-medium rounded-xl text-center transition-colors">
                Start Free Trial
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-8 rounded-2xl bg-brand-surface/40 border border-brand-accent/20 flex flex-col justify-between relative shadow-2xl">
              <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-brand-accent text-brand-bg text-xs font-bold uppercase tracking-wider rounded-full">
                Popular
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Pro Business</h3>
                <p className="text-sm text-brand-muted mb-6">For teams deploying cross-border web suites and synchronized video.</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-white">$49</span>
                  <span className="text-brand-muted text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-brand-text/90 mb-8">
                  <li className="flex items-center gap-2 text-brand-accent font-semibold">✓ Everything in Starter</li>
                  <li className="flex items-center gap-2">✓ Simultaneous 5-Language Development</li>
                  <li className="flex items-center gap-2">✓ Synchronized Voice & Video creation</li>
                  <li className="flex items-center gap-2">✓ Full Review Graphing Engine</li>
                </ul>
              </div>
              <Link href="/signup" className="block w-full py-3 bg-brand-accent hover:opacity-90 text-brand-bg font-bold rounded-xl text-center transition-all shadow-lg shadow-brand-accent/10">
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-brand-bg text-xs text-brand-muted/60 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} SignalBoost. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-brand-muted">Terms of Service</a>
            <a href="#" className="hover:text-brand-muted">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
