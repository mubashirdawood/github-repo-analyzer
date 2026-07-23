import { motion } from 'framer-motion'
import { GitBranch, Star, Circle, Sparkles } from 'lucide-react'

const codeLines = [
  { t: <span className="text-slate-400">// AI scanning repository...</span>, d: 0.1 },
  {
    t: (
      <>
        <span className="text-fuchsia-400">import</span> {'{ analyze }'}{' '}
        <span className="text-fuchsia-400">from</span>{' '}
        <span className="text-emerald-400">&apos;@gitlens/core&apos;</span>
      </>
    ),
    d: 0.3,
  },
  { t: <>&nbsp;</>, d: 0.4 },
  {
    t: (
      <>
        <span className="text-fuchsia-400">const</span>{' '}
        <span className="text-sky-300">repo</span> ={' '}
        <span className="text-fuchsia-400">await</span>{' '}
        <span className="text-yellow-300">analyze</span>
        {'({'}
      </>
    ),
    d: 0.5,
  },
  {
    t: (
      <>
        &nbsp;&nbsp;url: <span className="text-emerald-400">&apos;github.com/vercel/next.js&apos;</span>,
      </>
    ),
    d: 0.7,
  },
  {
    t: (
      <>
        &nbsp;&nbsp;depth: <span className="text-orange-300">&apos;architecture&apos;</span>,
      </>
    ),
    d: 0.85,
  },
  { t: <>{'});'}</>, d: 1.0 },
]

export default function HeroMockup({ active = false }) {
  return (
    <div className="relative w-full max-w-full">
      <div
        className="pointer-events-none absolute -inset-4 rounded-[36px] opacity-70 blur-3xl sm:-inset-8"
        style={{
          background: 'radial-gradient(60% 50% at 50% 40%, rgba(37,99,235,.35), transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 10 }}
        animate={active ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 30, rotateX: 10 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformPerspective: 1200 }}
        className="relative w-full max-w-full overflow-hidden rounded-2xl border border-black/10 bg-[var(--night)] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[var(--night-2)] px-3 py-2.5 sm:px-4">
          <div className="flex shrink-0 gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex min-w-0 max-w-[60%] items-center gap-1.5 truncate rounded-md bg-white/5 px-2 py-1 text-[10px] text-white/60 sm:max-w-none sm:px-3 sm:text-[11px]">
            <Circle className="h-2.5 w-2.5 shrink-0 fill-emerald-400 text-emerald-400" />
            <span className="truncate">gitlens.ai/analyze</span>
          </div>
          <div className="hidden w-12 sm:block" />
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold text-white">
              V
            </div>
            <span className="truncate text-sm font-medium text-white">vercel / next.js</span>
            <span className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 sm:inline">
              public
            </span>
          </div>
          <div className="hidden items-center gap-3 text-[11px] text-white/60 sm:flex">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" /> 128k
            </span>
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> 27k
            </span>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
          <div className="relative min-w-0 border-white/5 md:border-r">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 text-[11px] text-white/50">
              <span>analyze.ts</span>
              <span className="flex items-center gap-1 text-[var(--brand-soft)]">
                <Sparkles className="h-3 w-3 animate-brand-pulse" /> AI live
              </span>
            </div>
            <div className="relative overflow-x-auto p-3 font-mono text-[10px] leading-5 text-white/85 sm:p-4 sm:text-[11.5px] sm:leading-6">
              {codeLines.map((l, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                  transition={{ delay: active ? 0.35 + l.d : 0, duration: 0.3 }}
                  className="flex gap-2 sm:gap-3"
                >
                  <span className="w-4 shrink-0 select-none text-right text-white/25">{i + 1}</span>
                  <span className="min-w-0 break-words">{l.t}</span>
                </motion.div>
              ))}
              <motion.span
                initial={{ opacity: 0 }}
                animate={active ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: active ? 1.5 : 0 }}
                className="ml-7 inline-block h-4 w-1.5 translate-y-0.5 animate-blink bg-[var(--brand-soft)]"
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-[var(--brand)]/25 to-transparent" />
            </div>
          </div>

          <div className="relative min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] text-white/50">
              <span>Architecture</span>
              <span className="rounded-md bg-[var(--brand)]/15 px-2 py-0.5 text-[10px] text-[var(--brand-soft)]">
                generated
              </span>
            </div>
            <ArchGraph active={active} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { l: 'Files', v: '8,412' },
                { l: 'Modules', v: '126' },
                { l: 'Deps', v: '47' },
              ].map((s, i) => (
                <motion.div
                  key={s.l}
                  initial={{ opacity: 0, y: 6 }}
                  animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ delay: active ? 1.2 + i * 0.1 : 0 }}
                  className="rounded-lg border border-white/5 bg-white/[.03] py-2"
                >
                  <div className="font-display text-xs font-semibold text-white sm:text-sm">{s.v}</div>
                  <div className="text-[9px] uppercase tracking-wider text-white/40 sm:text-[10px]">{s.l}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ delay: active ? 0.9 : 0 }}
        className="absolute -left-6 top-24 hidden animate-float rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-glow backdrop-blur-md lg:block"
      >
        <div className="flex items-center gap-2 text-[11px] font-medium">
          <span className="h-2 w-2 animate-brand-pulse rounded-full bg-emerald-500" />
          Analysis complete · 12.4s
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ delay: active ? 1.1 : 0 }}
        style={{ animationDelay: '1.5s' }}
        className="absolute -right-6 bottom-24 hidden animate-float rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-glow backdrop-blur-md lg:block"
      >
        <div className="text-[11px] font-medium text-[var(--ink)]">
          <span className="text-[var(--brand)]">TypeScript</span> · React · Node.js
        </div>
      </motion.div>
    </div>
  )
}

function ArchGraph({ active = false }) {
  const nodes = [
    { x: 50, y: 25, label: 'Client' },
    { x: 160, y: 25, label: 'Edge' },
    { x: 270, y: 25, label: 'API' },
    { x: 105, y: 100, label: 'Router' },
    { x: 215, y: 100, label: 'Auth' },
    { x: 160, y: 170, label: 'DB' },
  ]
  const edges = [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 5],
    [3, 4],
  ]

  return (
    <div className="relative rounded-lg border border-white/5 bg-white/[.02] p-3">
      <svg viewBox="0 0 320 200" className="w-full">
        <defs>
          <linearGradient id="edge" x1="0" x2="1">
            <stop offset="0" stopColor="#3B82F6" stopOpacity="0.1" />
            <stop offset="0.5" stopColor="#60A5FA" stopOpacity="0.8" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {edges.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="url(#edge)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={active ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
            transition={{ delay: active ? 0.7 + i * 0.08 : 0, duration: 0.5 }}
            className="animate-dash"
          />
        ))}
        {nodes.map((n, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
            transition={{ delay: active ? 0.55 + i * 0.08 : 0 }}
          >
            <circle cx={n.x} cy={n.y} r="18" fill="#0a0f24" stroke="rgba(96,165,250,.5)" />
            <circle cx={n.x} cy={n.y} r="4" fill="#60A5FA" className="animate-brand-pulse" />
            <text
              x={n.x}
              y={n.y + 32}
              textAnchor="middle"
              fill="rgba(255,255,255,.55)"
              fontSize="9"
              fontFamily="Inter"
            >
              {n.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  )
}
