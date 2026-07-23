import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sendContact } from '../api'
import FrameSideParticles from '../components/FrameSideParticles'
import GitLensMarketing from '../components/landing/GitLensMarketing'

const FRAME_COUNT = 179
const FRAME_SPAN = FRAME_COUNT - 1
const SCROLL_HEIGHT = '720vh'
const SMOOTHING = 0.065
const MAX_FRAME_STEP = 1
const SETTLE_EPS = 0.0004
const PRELOAD_PRIORITY = 16
const DECODE_BATCH = 12

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'product', label: 'Product' },
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
]

function framePath(index) {
  const pad = String(index).padStart(3, '0')
  const ext = index === FRAME_COUNT ? 'png' : 'jpg'
  return `/frames/ezgif-frame-${pad}.${ext}`
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Draw like CSS object-cover — never clears the canvas first (avoids black flash). */
function drawCover(ctx, img, cw, ch) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih || !cw || !ch) return
  const scale = Math.max(cw / iw, ch / ih)
  const sw = cw / scale
  const sh = ch / scale
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
}

/**
 * Landing: animated scroll hero first, then GitLens marketing sections.
 */
export default function LandingPage() {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const frameShellRef = useRef(null)
  const particlesRef = useRef(null)
  const outroOverlayRef = useRef(null)
  const outroContentRef = useRef(null)
  const framesRef = useRef([])
  const [activeId, setActiveId] = useState('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [contactStatus, setContactStatus] = useState('idle')
  const [contactError, setContactError] = useState('')

  useEffect(() => {
    let cancelled = false
    const frames = new Array(FRAME_COUNT)
    const preloadLinks = []

    for (let i = 1; i <= Math.min(PRELOAD_PRIORITY, FRAME_COUNT); i += 1) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = framePath(i)
      if (i === 1) link.fetchPriority = 'high'
      document.head.appendChild(link)
      preloadLinks.push(link)
    }

    for (let i = 1; i <= FRAME_COUNT; i += 1) {
      const img = new Image()
      img.decoding = 'async'
      if (i <= PRELOAD_PRIORITY && 'fetchPriority' in img) {
        img.fetchPriority = 'high'
      }
      img.src = framePath(i)
      frames[i - 1] = img
    }
    framesRef.current = frames

    const decodeBatch = async (start) => {
      if (cancelled || start >= FRAME_COUNT) return
      const end = Math.min(start + DECODE_BATCH, FRAME_COUNT)
      const pending = []
      for (let i = start; i < end; i += 1) {
        const img = frames[i]
        if (!img) continue
        pending.push(
          (img.decode ? img.decode() : Promise.resolve()).catch(() => {}),
        )
      }
      await Promise.all(pending)
      if (cancelled) return
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      return decodeBatch(end)
    }

    decodeBatch(0)

    return () => {
      cancelled = true
      preloadLinks.forEach((link) => link.remove())
      framesRef.current = []
    }
  }, [])

  useEffect(() => {
    let targetProgress = 0
    let smoothProgress = 0
    let displayFrame = 1
    let shownFrame = -1
    let lastOutro = -1
    let rafId = 0
    let running = false
    let scrollable = 1
    let resizeRaf = 0
    let ctx = null

    const getCtx = () => {
      const canvas = canvasRef.current
      if (!canvas) return null
      if (!ctx || ctx.canvas !== canvas) {
        try {
          ctx = canvas.getContext('2d', { alpha: false })
        } catch {
          ctx = canvas.getContext('2d')
        }
      }
      return ctx
    }

    const syncCanvasSize = () => {
      const canvas = canvasRef.current
      const shell = frameShellRef.current
      if (!canvas || !shell) return false
      const rect = shell.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width === w && canvas.height === h) return false

      // Resizing a canvas clears it — snapshot first so DevTools toggles don't flash black.
      let snapshot = null
      if (canvas.width > 0 && canvas.height > 0 && shownFrame > 0) {
        snapshot = document.createElement('canvas')
        snapshot.width = canvas.width
        snapshot.height = canvas.height
        const snapCtx = snapshot.getContext('2d')
        if (snapCtx) snapCtx.drawImage(canvas, 0, 0)
      }

      canvas.width = w
      canvas.height = h
      ctx = null
      const context = getCtx()
      if (context && snapshot) {
        context.drawImage(snapshot, 0, 0, w, h)
      }
      shownFrame = -1
      return true
    }

    const paintFrame = (index) => {
      const canvas = canvasRef.current
      const cached = framesRef.current[index - 1]
      const context = getCtx()
      if (!canvas || !context || !cached) return false
      if (!cached.complete || !(cached.naturalWidth || cached.width)) return false
      drawCover(context, cached, canvas.width, canvas.height)
      shownFrame = index
      return true
    }

    const showFrame = (index) => {
      if (index === shownFrame) return
      // If the target isn't ready yet, keep the last painted pixels (no black flash).
      if (!paintFrame(index)) return
    }

    const cacheMetrics = () => {
      const section = sectionRef.current
      if (!section) {
        scrollable = 1
        return
      }
      scrollable = Math.max(section.offsetHeight - window.innerHeight, 1)
    }

    const applyOutro = (outro) => {
      if (outro === lastOutro) return
      lastOutro = outro

      const shell = frameShellRef.current
      if (shell) {
        shell.style.filter = `blur(${outro * 10}px) brightness(${1 - outro * 0.25})`
        shell.style.transform = `scale(${1 - outro * 0.02})`
      }

      const particles = particlesRef.current
      if (particles) {
        particles.style.opacity = String(1 - outro)
      }

      const overlay = outroOverlayRef.current
      if (overlay) {
        overlay.style.opacity = String(outro)
        overlay.style.visibility = outro > 0.02 ? 'visible' : 'hidden'
      }

      const content = outroContentRef.current
      if (content) {
        content.style.pointerEvents = outro > 0.4 ? 'auto' : 'none'
      }
    }

    const readScrollProgress = () => {
      const section = sectionRef.current
      if (!section) return 0
      const top = section.getBoundingClientRect().top
      const scrolled = Math.min(Math.max(-top, 0), scrollable)
      return scrolled / scrollable
    }

    const tick = () => {
      targetProgress = readScrollProgress()
      smoothProgress += (targetProgress - smoothProgress) * SMOOTHING
      const deltaProgress = targetProgress - smoothProgress
      if (deltaProgress < SETTLE_EPS && deltaProgress > -SETTLE_EPS) {
        smoothProgress = targetProgress
      }

      const clamped = smoothProgress < 0 ? 0 : smoothProgress > 1 ? 1 : smoothProgress
      const eased = easeInOutCubic(clamped)
      const idealFrame = Math.min(
        FRAME_COUNT,
        Math.max(1, Math.round(eased * FRAME_SPAN) + 1),
      )

      const delta = idealFrame - displayFrame
      if (delta !== 0) {
        displayFrame += Math.sign(delta) * Math.min(Math.abs(delta), MAX_FRAME_STEP)
        showFrame(displayFrame)
      } else if (shownFrame !== displayFrame) {
        // Retry paint when decode catches up (e.g. after resize / DevTools toggle).
        showFrame(displayFrame)
      }

      const outro = clamped <= 0.9 ? 0 : clamped >= 1 ? 1 : (clamped - 0.9) / 0.1
      applyOutro(outro)

      const settled =
        smoothProgress === targetProgress &&
        displayFrame === idealFrame &&
        shownFrame === displayFrame
      if (settled) {
        running = false
        rafId = 0
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    const startLoop = () => {
      if (running) return
      running = true
      rafId = requestAnimationFrame(tick)
    }

    const onScroll = () => {
      targetProgress = readScrollProgress()
      startLoop()
    }

    // DevTools mobile toggle fires many resizes — coalesce to one paint pass.
    const onResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        cacheMetrics()
        syncCanvasSize()
        paintFrame(displayFrame)
        targetProgress = readScrollProgress()
        startLoop()
      })
    }

    cacheMetrics()
    syncCanvasSize()
    targetProgress = readScrollProgress()
    applyOutro(0)
    // Paint frame 1 as soon as it is available; retry via the loop if still loading.
    if (!paintFrame(1)) {
      const first = framesRef.current[0]
      if (first) {
        const onReady = () => {
          syncCanvasSize()
          paintFrame(1)
        }
        if (first.complete) onReady()
        else first.addEventListener('load', onReady, { once: true })
      }
    }
    startLoop()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (rafId) cancelAnimationFrame(rafId)
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      running = false
      ctx = null
    }
  }, [])

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

      {/* Home — scroll animation (kept from this project) */}
      <section id="home" ref={sectionRef} className="relative scroll-mt-16" style={{ height: SCROLL_HEIGHT }}>
        <div className="sticky top-0  flex h-screen w-full items-center justify-center overflow-hidden bg-zinc-100 px-5 pb-8 pt-20 sm:px-10 sm:pb-10 sm:pt-24">
          <FrameSideParticles ref={particlesRef} />

          <div
            ref={frameShellRef}
            className="relative z-[6] w-full max-w-5xl overflow-hidden rounded-2xl border-[3px] border-zinc-950 bg-zinc-950 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.45)] transition-[filter,transform] duration-500 ease-out sm:rounded-3xl sm:border-4"
            style={{
              maxHeight: 'calc(100vh - 8.5rem)',
              aspectRatio: '16 / 9',
              filter: 'blur(0px) brightness(1)',
              transform: 'scale(1)',
            }}
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="block h-full w-full select-none"
            />
          </div>

          <div
            ref={outroOverlayRef}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pt-16 transition-opacity duration-500"
            style={{
              opacity: 0,
              visibility: 'hidden',
            }}
          >
            <div className="absolute inset-0 bg-white/35 backdrop-blur-md" aria-hidden="true" />
            <div
              ref={outroContentRef}
              className="relative z-10 max-w-xl px-6 py-8 text-center"
              style={{ pointerEvents: 'none' }}
            >
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
                GitLens<span className="text-sky-600">.ai</span>
              </h1>
              <p className="mt-4 text-base text-zinc-600 sm:text-lg">
                Understand any GitHub codebase, faster.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/login"
                  className="inline-flex rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Get started
                </Link>
                <button
                  type="button"
                  onClick={() => goTo('product')}
                  className="inline-flex rounded-xl border border-zinc-300 bg-white/90 px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
                >
                  Explore product
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GitLens marketing UI (hero + rest) */}
      <GitLensMarketing />

      {/* Contact */}
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
