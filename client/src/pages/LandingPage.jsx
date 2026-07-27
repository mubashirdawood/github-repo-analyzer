import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sendContact } from '../api'
import GitLensMarketing from '../components/landing/GitLensMarketing'

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
]

function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Landing: product hero first, then GitLens marketing sections + contact.
 */
export default function LandingPage() {
  const [activeId, setActiveId] = useState('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [contactStatus, setContactStatus] = useState('idle')
  const [contactError, setContactError] = useState('')

  useEffect(() => {
    const nodes = NAV_LINKS.map(({ id }) => document.getElementById(id)).filter(Boolean)
    if (!nodes.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0.08, 0.2, 0.4] },
    )

    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])

  const goTo = (id) => {
    setMenuOpen(false)
    scrollToId(id)
  }

  const handleContactSubmit = async (e) => {
    e.preventDefault()
    setContactError('')
    setContactStatus('sending')

    const form = e.currentTarget
    const data = new FormData(form)

    try {
      await sendContact({
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        message: String(data.get('message') || '').trim(),
      })
      setContactStatus('sent')
      form.reset()
    } catch (err) {
      setContactStatus('error')
      setContactError(err.message || 'Failed to send message.')
    }
  }

  return (
    <div className="bg-white text-zinc-900 font-sans selection:bg-sky-200/70 selection:text-zinc-900">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => goTo('home')}
            className="flex shrink-0 items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-zinc-900">
              GitLens<span className="text-sky-600">.ai</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV_LINKS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => goTo(id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeId === id
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:inline-flex"
            >
              Log in / Sign up
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 lg:hidden"
              aria-expanded={menuOpen}
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-zinc-200 bg-white px-4 py-3 lg:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {NAV_LINKS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => goTo(id)}
                  className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    activeId === id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  {label}
                </button>
              ))}
              <Link
                to="/login"
                className="mt-2 rounded-xl bg-zinc-900 px-3 py-2.5 text-center text-sm font-medium text-white sm:hidden"
                onClick={() => setMenuOpen(false)}
              >
                Log in / Sign up
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Spacer for fixed header — product hero starts immediately below */}
      <div className="h-16" aria-hidden="true" />

      <GitLensMarketing />

      <section id="contact" className="scroll-mt-16 border-t border-zinc-800 bg-black/20 ">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Contact</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Talk to us.
            </h2>
            <p className="mt-4 text-base text-zinc-500 sm:text-lg">
              Partnerships, feedback, or a repo that broke your brain — we want to hear it.
            </p>
          </div>

          <form
            className="mx-auto mt-12 max-w-xl space-y-5"
            onSubmit={handleContactSubmit}
          >
            <div>
              <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Your Name
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                required
                disabled={contactStatus === 'sending'}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                placeholder="GitLens"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                required
                disabled={contactStatus === 'sending'}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Message
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={5}
                disabled={contactStatus === 'sending'}
                className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
                placeholder="Tell us what you’re building…"
              />
            </div>
            <button
              type="submit"
              disabled={contactStatus === 'sending'}
              className="w-full rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {contactStatus === 'sending' ? 'Sending…' : 'Send message'}
            </button>
            {contactStatus === 'sent' && (
              <p className="text-center text-sm font-medium text-teal-700">
                Message sent — we’ll get back to you soon.
              </p>
            )}
            {contactStatus === 'error' && (
              <p className="text-center text-sm font-medium text-red-600">
                {contactError}
              </p>
            )}
            <p className="text-center text-sm text-zinc-400">
              Or email{' '}
              <a href="mailto:mubashirdawood05@gmail.com" className="font-medium text-sky-700 hover:underline">
                hello@gitlens.ai
              </a>
            </p>
          </form>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} GitLens.ai — understand code, faster.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {NAV_LINKS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => goTo(id)}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
