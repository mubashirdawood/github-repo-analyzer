import { motion } from 'framer-motion'
import { forwardRef, useMemo } from 'react'

const LEFT_SEEDS = [
  { top: '12%', size: 6, color: '#0ea5e9', dur: 5.2, delay: 0.1, x: [0, -10, 6, 0], y: [0, -22, -8, 0] },
  { top: '22%', size: 3, color: '#38bdf8', dur: 4.1, delay: 0.6, x: [0, 8, -4, 0], y: [0, -14, 10, 0] },
  { top: '34%', size: 9, color: '#0284c7', dur: 6.4, delay: 0.2, x: [0, -14, 4, 0], y: [0, 18, -12, 0] },
  { top: '46%', size: 4, color: '#7dd3fc', dur: 3.8, delay: 1.1, x: [0, 6, -10, 0], y: [0, -20, 6, 0] },
  { top: '58%', size: 7, color: '#0ea5e9', dur: 5.6, delay: 0.4, x: [0, -8, 12, 0], y: [0, 16, -6, 0] },
  { top: '68%', size: 3, color: '#0369a1', dur: 4.7, delay: 0.9, x: [0, 10, -6, 0], y: [0, -12, 14, 0] },
  { top: '78%', size: 5, color: '#38bdf8', dur: 5.9, delay: 0.3, x: [0, -12, 5, 0], y: [0, 10, -18, 0] },
  { top: '18%', size: 2, color: '#bae6fd', dur: 3.4, delay: 1.4, x: [0, 4, -8, 0], y: [0, -16, 4, 0] },
  { top: '52%', size: 11, color: '#0284c7', dur: 7.1, delay: 0.7, x: [0, -6, 10, 0], y: [0, -10, 20, 0] },
  { top: '86%', size: 4, color: '#0ea5e9', dur: 4.5, delay: 1.2, x: [0, 9, -5, 0], y: [0, -14, 8, 0] },
]

const RIGHT_SEEDS = [
  { top: '14%', size: 5, color: '#0ea5e9', dur: 4.8, delay: 0.2, x: [0, 12, -5, 0], y: [0, -18, 8, 0] },
  { top: '26%', size: 8, color: '#0284c7', dur: 6.2, delay: 0.5, x: [0, 8, -14, 0], y: [0, 14, -10, 0] },
  { top: '38%', size: 3, color: '#7dd3fc', dur: 3.9, delay: 1.0, x: [0, -6, 10, 0], y: [0, -20, 6, 0] },
  { top: '48%', size: 6, color: '#38bdf8', dur: 5.4, delay: 0.15, x: [0, 14, -4, 0], y: [0, 12, -16, 0] },
  { top: '60%', size: 4, color: '#0369a1', dur: 4.3, delay: 0.8, x: [0, -10, 7, 0], y: [0, -8, 18, 0] },
  { top: '72%', size: 10, color: '#0ea5e9', dur: 6.8, delay: 0.35, x: [0, 6, -12, 0], y: [0, -22, 4, 0] },
  { top: '82%', size: 3, color: '#bae6fd', dur: 3.6, delay: 1.3, x: [0, -8, 5, 0], y: [0, 10, -12, 0] },
  { top: '20%', size: 2, color: '#38bdf8', dur: 4.0, delay: 0.95, x: [0, 5, -9, 0], y: [0, -14, 10, 0] },
  { top: '54%', size: 7, color: '#0284c7', dur: 5.7, delay: 0.55, x: [0, 11, -6, 0], y: [0, 16, -8, 0] },
  { top: '88%', size: 5, color: '#0ea5e9', dur: 4.9, delay: 0.25, x: [0, -7, 12, 0], y: [0, -10, 14, 0] },
]

function Particle({ seed, side }) {
  const edge = side === 'left' ? { left: `${8 + (seed.size % 5) * 6}%` } : { right: `${8 + (seed.size % 5) * 6}%` }

  return (
    <motion.span
      aria-hidden="true"
      className="absolute rounded-full"
      style={{
        top: seed.top,
        width: seed.size,
        height: seed.size,
        background: seed.color,
        boxShadow: `0 0 ${seed.size * 2.2}px ${seed.color}88`,
        ...edge,
      }}
      animate={{
        x: seed.x,
        y: seed.y,
        opacity: [0.25, 0.95, 0.45, 0.85, 0.25],
        scale: [1, 1.25, 0.9, 1.15, 1],
      }}
      transition={{
        duration: seed.dur,
        delay: seed.delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

/**
 * Soft sky particles drifting along the left/right gutters of the hero frame.
 * Opacity is driven via ref (parent sets style.opacity) to avoid React re-renders
 * during the scroll-linked hero sequence.
 */
const FrameSideParticles = forwardRef(function FrameSideParticles(_props, ref) {
  const left = useMemo(() => LEFT_SEEDS, [])
  const right = useMemo(() => RIGHT_SEEDS, [])

  return (
    <motion.div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-[5] hidden sm:block"
      style={{ opacity: 1 }}
      aria-hidden="true"
    >
      <div className="absolute inset-y-16 left-0 w-[12%] max-w-[7rem] lg:w-[14%] lg:max-w-[9rem]">
        {left.map((seed, i) => (
          <Particle key={`L${i}`} seed={seed} side="left" />
        ))}
      </div>
      <div className="absolute inset-y-16 right-0 w-[12%] max-w-[7rem] lg:w-[14%] lg:max-w-[9rem]">
        {right.map((seed, i) => (
          <Particle key={`R${i}`} seed={seed} side="right" />
        ))}
      </div>
    </motion.div>
  )
})

FrameSideParticles.displayName = 'FrameSideParticles'

export default FrameSideParticles
