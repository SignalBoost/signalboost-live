import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent tracking-wide">
              SignalBoost
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
              Beta
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-slate-200 transition-colors">Features</a>
            <a href="#languages" className="hover:text-slate-200 transition-colors">Languages</a>
            <a href="#pricing" className="hover:text-slate-200 transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-600/20">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent opacity-70 pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
            Build Native Multi-Language Platforms{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              From Scratch with AI
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            Not just simple translation layers. Completely build, design, and manage entire landing pages, media assets, localized scripts, and user engagement reviews in 5 native structures simultaneously.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/generator" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-xl shadow-indigo-600/20 text-center">
              Launch AI Website Generator
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl transition-colors text-center">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Everything needed to launch and run an AI SaaS</h2>
            <p className="text-slate-400">Generate structural layouts, high-fidelity media pipelines, and full support suites directly within an automated workflow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-900 hover:border-slate-800/80 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-5 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                🖥️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Native Web Architecture</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Generate semantic HTML/CSS visual frameworks completely optimized for lightning-fast speeds, skipping restrictive iframe elements.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-900 hover:border-slate-800/80 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 mb-5 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-all">
                🎙️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Synchronized Media Generation</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Create voice tracks and video advertisements completely synchronized inside the app dashboard, powered by multi-language neural logic.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-900 hover:border-slate-800/80 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 mb-5 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                📊
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Review Management</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Analyze public client remarks and auto-generate promotional graphic structures to turn customer reviews into conversions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-Cultural Language Framework Section */}
      <section id="languages" className="py-20 border-t border-slate-900 bg-slate-900/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Deep Cultural Development</h2>
          <p className="text-slate-400 max-w-2xl mx-auto mb-12">
            The platform executes individual developmental flows for 5 key geographical ecosystems directly, respecting formatting, tone, and functional behavior:
          </p>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {["English (US/UK)", "Español", "Português", "Polski", "Русский"].map((lang, index) => (
              <span key={index} className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl text-sm font-medium shadow-sm">
                🌐 {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Simplified Pricing Tiers */}
      <section id="pricing" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Straightforward Plans</h2>
            <p className="text-slate-400">Scale the generation requirements as operations grow. Full Stripe checkout ready.</p>
          </div>

          <div className="max-w-md mx-auto grid gap-8 lg:max-w-4xl lg:grid-cols-2">
            {/* Starter Plan */}
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-900 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Starter</h3>
                <p className="text-sm text-slate-400 mb-6">Perfect for building out initial landing pages and concepts.</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-white">$19</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-300 mb-8">
                  <li className="flex items-center gap-2">✓ Static Website Generation</li>
                  <li className="flex items-center gap-2">✓ Next.js Standard Route exports</li>
                  <li className="flex items-center gap-2">✓ Basic AI Voice processing</li>
                </ul>
              </div>
              <Link href="/signup" className="block w-full py-3 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium rounded-xl text-center transition-colors">
                Start Free Trial
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-indigo-950/30 border border-indigo-500/20 flex flex-col justify-between relative shadow-2xl shadow-indigo-500/5">
              <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold uppercase tracking-wider rounded-full">
                Popular
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Pro Business</h3>
                <p className="text-sm text-slate-400 mb-6">For teams deploying cross-border web suites and synchronized video.</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-white">$49</span>
                  <span className="text-slate-500 text-sm"> / month</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-300 mb-8">
                  <li className="flex items-center gap-2 text-blue-400">✓ Everything in Starter</li>
                  <li className="flex items-center gap-2">✓ Simultaneous 5-Language Development</li>
                  <li className="flex items-center gap-2">✓ Synchronized Voice & Video creation</li>
                  <li className="flex items-center gap-2">✓ Full Review Graphing Engine</li>
                </ul>
              </div>
              <Link href="/signup" className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-center transition-colors shadow-lg shadow-blue-600/20">
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 text-xs text-slate-600 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} SignalBoost. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-400">Terms of Service</a>
            <a href="#" className="hover:text-slate-400">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
