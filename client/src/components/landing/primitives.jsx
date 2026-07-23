import { motion } from 'framer-motion'

export function SectionHeader({ eyebrow, title, desc, center = true }) {
  return (
    <div className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      {eyebrow && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className={`${
            center ? 'mx-auto' : ''
          } inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-1 text-xs font-medium text-[var(--brand)] shadow-soft`}
        >
          <span className="h-1.5 w-1.5 animate-brand-pulse rounded-full bg-[var(--brand)]" />
          {eyebrow}
        </motion.div>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ delay: 0.05 }}
        className="mt-5 font-display text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl"
      >
        {title}
      </motion.h2>
      {desc && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ delay: 0.1 }}
          className="mt-4 text-base text-[var(--muted-foreground)] sm:text-lg"
        >
          {desc}
        </motion.p>
      )}
    </div>
  )
}

export function GlowCard({ children, className = '' }) {
  return (
    <div
      className={`group relative rounded-2xl border border-black/5 bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-glow ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'linear-gradient(135deg, rgba(37,99,235,.4), transparent 40%, rgba(59,130,246,.3))',
          padding: 1,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      {children}
    </div>
  )
}
