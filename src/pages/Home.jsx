import { Link } from "react-router-dom"

export default function Home() {
  return (
    <div className="min-h-screen bg-app text-white/90">
      {/* Navbar */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/5">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-fuchsia flex items-center justify-center shadow-md">
                <span className="text-sm font-bold">IN</span>
              </div>
              <div className="leading-tight">
                <div className="font-semibold">INCH</div>
                <div className="text-[10px] text-slate-300">Tailoring Management System</div>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <a href="#contact" className="hover:text-white">Contact</a>
            </nav>
            <div className="flex items-center gap-3">
              <Link to="/auth" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
              <Link to="/signup" className="pill-active glow text-sm px-3 py-2 rounded-md">Get Started</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
              <span className="text-xl">👤</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Effortless Customer Management</h1>
            <p className="mt-2 text-brand-fuchsia/90 font-semibold">Never Lose Track Again</p>
            <p className="mt-4 text-slate-300">Manage customer profiles, measurements, preferences, and order history all in one centralized, intuitive platform.</p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link to="/signup" className="pill-active glow px-5 py-3 rounded-full font-medium">Get Started Now →</Link>
            </div>
            <div className="mt-8 text-xs text-slate-400">Trusted by tailors worldwide • 4.9/5 rating</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <div className="inline-block text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Everything You Need in One Platform</div>
            <h2 className="mt-3 text-2xl md:text-4xl font-bold">Complete Tailoring Management Suite</h2>
            <p className="mt-2 text-slate-300 max-w-2xl mx-auto">From customer management to business analytics, INCH provides all the tools you need to run a modern, efficient tailoring business.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { title: 'Advanced Customer Management', points: ['500+ Customers', 'Zero Data Loss', 'Instant Access'], icon: '👥' },
              { title: 'Smart Inventory Control', points: ['Real-time Tracking', 'Supplier Integration', 'Auto Alerts'], icon: '📦' },
              { title: 'Seamless Order & Invoicing', points: ['Digital Invoices', 'Payment Tracking', 'Order Timeline'], icon: '🧾' },
              { title: 'Business Intelligence', points: ['Reports & Insights', 'Trends & KPIs', 'Exports'], icon: '📊' },
              { title: 'Staff & Access Control', points: ['Roles & Permissions', 'Audit Logs', 'SAML/SSO Ready'], icon: '🛡️' },
              { title: 'Public Customer Portal', points: ['Profile & Orders', 'Measurements', 'Appointments'], icon: '🌐' },
            ].map((f, i) => (
              <div key={i} className="glass rounded-2xl border border-white/10 p-5">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg mb-3">{f.icon}</div>
                <div className="font-semibold">{f.title}</div>
                <ul className="mt-3 space-y-1 text-sm text-slate-300">
                  {f.points.map((p, j) => (
                    <li key={j} className="flex items-center gap-2"><span className="text-brand-fuchsia">•</span>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <div className="inline-block text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Simple, Transparent Pricing</div>
            <h2 className="mt-3 text-2xl md:text-4xl font-bold">One Plan, Everything Included</h2>
            <p className="mt-2 text-slate-300">No hidden fees, no complicated tiers. One comprehensive plan that grows with your business.</p>
          </div>
          <div className="mx-auto max-w-2xl">
            <div className="glass rounded-2xl border border-white/10 p-8">
              <div className="text-center">
                <div className="text-5xl font-extrabold text-brand-fuchsia drop-shadow">3,000 QAR</div>
                <div className="text-slate-400 mt-1">per year • Billed annually • Save 20%</div>
              </div>
              <ul className="mt-6 grid md:grid-cols-2 gap-2 text-sm text-slate-300">
                {[
                  'Unlimited customers & orders',
                  'Advanced reporting & analytics',
                  'Professional invoicing',
                  'Priority customer support',
                  'Complete inventory management',
                  'Staff management & permissions',
                  'Customer portal & public profile',
                  'Free updates & new features',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2"><span className="text-green-400">✓</span>{item}</li>
                ))}
              </ul>
              <div className="mt-8 text-center">
                <Link to="/signup" className="pill-active glow px-5 py-3 rounded-full font-medium">Get Started Today →</Link>
                <div className="text-xs text-slate-400 mt-2">No credit card required • Cancel anytime</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="contact" className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <div>
              <h3 className="text-xl md:text-2xl font-semibold">Tell us about your business</h3>
              <p className="text-slate-300 mt-2">We’ll help you migrate and get set up in minutes.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Assisted onboarding</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Free data import</li>
                <li className="flex items-center gap-2"><span className="text-green-400">✓</span> Live chat support</li>
              </ul>
            </div>
            <div className="glass rounded-2xl border border-white/10 p-6">
              <form className="space-y-3">
                <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" placeholder="Your name" />
                <input className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" placeholder="Email address" type="email" />
                <textarea rows="5" className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400" placeholder="Tell us about your tailoring business..." />
                <button type="button" className="pill-active glow w-full px-4 py-2 rounded-md">Send Message ↗</button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid md:grid-cols-4 gap-6 text-sm text-slate-300">
            <div className="col-span-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-fuchsia flex items-center justify-center shadow-md">
                  <span className="text-sm font-bold">IN</span>
                </div>
                <div>
                  <div className="font-semibold text-white/90">INCH</div>
                  <div className="text-[11px]">Tailoring Management System</div>
                </div>
              </div>
              <p className="mt-3 max-w-md">Revolutionizing the tailoring industry with intelligent management solutions.</p>
            </div>
            <div>
              <div className="font-semibold text-white/90">Platform</div>
              <ul className="mt-2 space-y-1">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#security" className="hover:text-white">Security</a></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white/90">Support</div>
              <ul className="mt-2 space-y-1">
                <li><a href="#contact" className="hover:text-white">Contact Us</a></li>
                <li><a href="#" className="hover:text-white">Help Center</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between text-xs text-slate-400">
            <div>© 2025 INCH. All rights reserved.</div>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
