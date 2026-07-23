import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Play,
  Sparkles,
  ShieldCheck,
  Zap,
  ChevronDown,
} from "lucide-react";
import HeroMockup from "./HeroMockup";
import { SectionHeader } from "./primitives";

/** Gate product entrance until the section itself is on screen (not during sticky home scroll). */
const PRODUCT_VIEWPORT = {
  once: true,
  amount: 0.25,
  margin: "0px 0px -22% 0px",
};

function GithubIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

export default function GitLensMarketing() {
  return (
    <>
      <GitLensHero />
      <LogoCloud />
      <Features />
      <ArchDemo />
      <FlowDemo />
      <Stats />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
    </>
  );
}

function GitLensHero() {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, PRODUCT_VIEWPORT);

  return (
    <section
      ref={sectionRef}
      id="product"
      className="relative scroll-mt-16 overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24"
    >
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-70" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[min(1100px,160vw)] -translate-x-1/2 rounded-full opacity-40 blur-3xl sm:h-[600px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(37,99,235,.45), transparent)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 sm:gap-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-8">
        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.5 }}
            className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-black/5 bg-[var(--brand)] py-1 pl-1 pr-2 text-[11px] font-medium shadow-soft sm:gap-2 sm:pr-3 sm:text-xs"
          >
            <span className="shrink-0 whitespace-nowrap rounded-full bg-green-300 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--brand)] animate-pulse sm:px-2 sm:py-0.5 sm:text-xs">
              GitLens Beta
            </span>
            <span className="min-w-0 flex-1 break-words leading-snug text-white sm:flex-none sm:whitespace-nowrap">
              Ask questions about any repo →
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 font-display text-[2rem] font-semibold leading-[1.08] tracking-tight text-[var(--ink)] sm:text-5xl sm:leading-[1.02] md:text-6xl lg:text-[68px]"
          >
            Understand any{" "}
            <span className="relative inline-block">
              <span className="text-gradient-brand  animate-pulse">
                GitHub repo
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="10"
                viewBox="0 0 200 10"
                fill="none"
              >
                <motion.path
                  d="M2 7 Q 100 -3 198 7"
                  stroke="#3B82F6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  fill="none"
                />
              </svg>
            </span>{" "}
            instantly with AI.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ delay: 0.15, duration: 0.8 }}
            className="mt-6 max-w-xl text-base text-[var(--muted-foreground)] sm:text-lg"
          >
            Paste a GitHub URL. GitLens scans the codebase and produces
            architecture diagrams, request flows, technology maps, and answers
            your questions — in seconds.
          </motion.p>

          <RepoInput active={inView} />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ delay: 0.35 }}
            className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <Link
              to="/login"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--night)] px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Start analyzing
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--ink)] backdrop-blur-md transition-colors hover:bg-white sm:w-auto"
            >
              <Play className="h-4 w-4 fill-current" />
              How it works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]"
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Read-only
              access
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[var(--brand)]" /> Under 15s
            </span>
            <span className="flex items-center gap-1.5">
              <GithubIcon className="h-3.5 w-3.5" /> Public & private repos
            </span>
          </motion.div>
        </div>

        <div className="w-full min-w-0 overflow-hidden lg:pl-6">
          <HeroMockup active={inView} />
        </div>
      </div>
    </section>
  );
}

function RepoInput({ active = false }) {
  const [url, setUrl] = useState("https://github.com/mubashirdawood");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ delay: 0.25 }}
      className="group relative mt-8 w-full max-w-xl"
    >
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl opacity-40 blur-xl transition-opacity group-focus-within:opacity-100"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div className="relative flex flex-col gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-soft sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface)]">
            <GithubIcon className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none placeholder:text-[var(--muted-foreground)]"
          />
        </div>
        <Link
          to="/login"
          className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 sm:w-auto"
        >
          <Sparkles className="h-4 w-4 animate-bounce" />
          Analyze
        </Link>
      </div>
    </motion.div>
  );
}

function LogoCloud() {
  const logos = [
    "Vercel",
    "Linear",
    "Supabase",
    "GitHub",
    "Stripe",
    "Notion",
    "Cursor",
    "Raycast",
  ];
  return (
    <section className="mx-3 border-y border-2 border-[var(--border)] bg-gray-600 bg-[var(--surface)]/60 py-6 sm:mx-6 sm:rounded-full sm:py-8 md:mx-12 lg:mx-20">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="text-center text-[10px] font-medium uppercase tracking-widest text-blue-300 sm:text-xs">
          Trusted by developers at
        </div>
        <div className="mt-4 overflow-hidden mask-fade-edges sm:mt-6">
          <div className="flex animate-marquee gap-8 whitespace-nowrap sm:gap-12 md:gap-16">
            {[...logos, ...logos].map((l, i) => (
              <div
                key={`${l}-${i}`}
                className="font-display text-lg font-semibold text-[var(--ink)]/40 transition-colors hover:text-blue-300 sm:text-xl md:text-2xl"
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const featureImages = [
  "/features_section/Gemini_Generated_Image_7b7dil7b7dil7b7d.png",
  "/features_section/Gemini_Generated_Image_a2tph3a2tph3a2tp.png",
  "/features_section/Gemini_Generated_Image_j00tsjj00tsjj00t.png",
  "/features_section/Gemini_Generated_Image_juk073juk073juk0.png",
  "/features_section/Gemini_Generated_Image_pgdkgvpgdkgvpgdk.png",
  "/features_section/Gemini_Generated_Image_pxxeerpxxeerpxxe.png",
  "/features_section/Gemini_Generated_Image_qycyfeqycyfeqycy.png",
  "/features_section/Gemini_Generated_Image_rv2hm3rv2hm3rv2h.png",
];

function Features() {
  return (
    <section id="features" className="relative scroll-mt-16 py-28">
      <div className="mx-auto max-w-7xl  px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={
            <>
              Everything you need to{" "}
              <span className="text-gradient-brand ">read a codebase</span>
            </>
          }
          desc="A complete toolkit for onboarding, code review, and architecture research — powered by AI that actually understands code."
        />

        <div className="mt-14 grid  bg-black/5 p-2 border-4 border-black rounded-2xl  gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featureImages.map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              className="group relative overflow-hidden rounded-2xl border-4 border-black bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-glow"
            >
              <img
                src={src}
                alt=""
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchDemo() {
  return (
    <section className="relative overflow-hidden bg-[var(--night)] py-28 text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-dark mask-fade-b opacity-50" />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-80 w-[1000px] -translate-x-1/2 opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(37,99,235,.5), transparent)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
              Live architecture
            </div>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              See the whole system,
              <br />
              not just files.
            </h2>
            <p className="mt-4 max-w-lg text-white/70">
              GitLens builds a live dependency graph of your repository. Every
              module, service, and boundary — laid out and explained.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/80">
              {[
                "Auto-detected modules & services",
                "Cross-package dependency edges",
                "Click any node for an AI explanation",
                "Export to Mermaid, SVG, and PNG",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--brand-soft)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <BigArch />
        </div>
      </div>
    </section>
  );
}

function BigArch() {
  const nodes = [
    { x: 60, y: 50, label: "Web" },
    { x: 220, y: 30, label: "CDN" },
    { x: 380, y: 60, label: "Edge Router" },
    { x: 90, y: 170, label: "API Gateway" },
    { x: 260, y: 170, label: "Auth Service" },
    { x: 420, y: 170, label: "Workers" },
    { x: 175, y: 290, label: "Postgres" },
    { x: 340, y: 290, label: "Redis" },
  ];
  const edges = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [3, 6],
    [4, 6],
    [4, 7],
    [5, 7],
  ];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="relative rounded-2xl border-8  border-l-0 border-r-0 border-blue-500 bg-none p-6 backdrop-blur-md"
    >
      <svg viewBox="0 0 500 350" className="w-full">
        <defs>
          <linearGradient id="e2" x1="0" x2="1">
            <stop offset="0" stopColor="#3B82F6" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#60A5FA" stopOpacity="1" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {edges.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="url(#e2)"
            strokeWidth="2"
            strokeDasharray="6 6"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.6 }}
            className="animate-dash"
          />
        ))}
        {nodes.map((n, i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.08 }}
          >
            <rect
              x={n.x - 55}
              y={n.y - 16}
              width="110"
              height="32"
              rx="8"
              fill="#0a0f24"
              stroke="rgba(96,165,250,.4)"
              strokeWidth="1"
            />
            <circle
              cx={n.x - 42}
              cy={n.y}
              r="3"
              fill="#60A5FA"
              className="animate-brand-pulse"
            />
            <text
              x={n.x - 32}
              y={n.y + 4}
              fill="white"
              fontSize="11"
              fontFamily="Inter"
            >
              {n.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </motion.div>
  );
}

function FlowDemo() {
  const steps = [
    "POST /login",
    "auth.middleware",
    "user.controller",
    "authService.verify",
    "db.users.find",
    "issueJWT",
    "200 OK",
  ];
  return (
    <section className="py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={
            <>
              Trace any endpoint{" "}
              <span className="text-gradient-brand">step by step</span>
            </>
          }
          desc="GitLens follows a request from HTTP to database — highlighting middleware, controllers, and side effects."
        />
        <div className="mt-14 rounded-2xl border border-black bg-black p-6 shadow-soft sm:p-10">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {steps.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3"
              >
                <div className="rounded-lg border-2 border-black bg-[var(--surface)] px-3 py-2 font-mono text-xs">
                  {s}
                </div>
                {i < steps.length - 1 && (
                  <motion.svg
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 + 0.1 }}
                    width="24"
                    height="8"
                    viewBox="0 0 24 8"
                  >
                    <motion.line
                      x1="0"
                      y1="4"
                      x2="24"
                      y2="4"
                      stroke="#3B82F6"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      className="animate-dash"
                    />
                  </motion.svg>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { v: "8M+", l: "Files analyzed" },
    { v: "120K", l: "Repositories" },
    { v: "< 15s", l: "Avg. analysis time" },
    { v: "99.98%", l: "Uptime" },
  ];
  return (
    <section className="py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 px-4 sm:grid-cols-2 sm:gap-4 sm:px-6 md:grid-cols-4 lg:px-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.l}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl border border-black/5 bg-white p-5 text-center shadow-soft sm:p-6"
          >
            <div className="font-display text-3xl font-semibold text-gradient sm:text-4xl">
              {s.v}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] sm:text-xs">
              {s.l}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Paste a GitHub URL",
      d: "Any public or authorized private repo.",
    },
    {
      n: "02",
      t: "Repository scanner",
      d: "We walk the tree and index every file.",
    },
    {
      n: "03",
      t: "AI analysis",
      d: "LLMs reason over modules, deps, and code.",
    },
    {
      n: "04",
      t: "Architecture generated",
      d: "Live diagrams, flows, tech stack.",
    },
    { n: "05", t: "Ask anything", d: "Chat with a grounded, cited assistant." },
    { n: "06", t: "Ship faster", d: "Onboard in hours, not weeks." },
  ];
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 bg-[var(--surface)] py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="How it works"
          title="From URL to understanding in seconds"
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-glow"
            >
              <div className="font-mono text-xs font-serif font-bold text-[var(--brand)]">
                {s.n}
              </div>
              <div className="mt-2 font-display text-xl font-semibold">
                {s.t}
              </div>
              <div className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                {s.d}
              </div>
              <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-[var(--brand)]/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const quotes = [
  {
    q: "The request-flow diagrams are unreal. It's like having a senior engineer walk you through every endpoint.",
    n: "HaiderAbbas ",
    r: "Founding  Engineer,",
  },
  {
    q: "We use GitLens in every code review now. It catches architectural drift before humans do.",
    n: "Faisal Khan",
    r: "COO, Loop",
  },
  {
    q: "We use GitLens in every code review now. It catches architectural drift before humans do.",
    n: "M.Maaz",
    r: "CTO, Loop",
  },
];

function Testimonials() {
  return (
    <section className="py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader title="What engineers say" />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {quotes.map((q, i) => (
            <motion.figure
              key={q.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-black bg-white p-6 shadow-soft"
            >
              <blockquote className="text-sm leading-relaxed text-[var(--ink)]">
                &ldquo;{q.q}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-black/5 pt-4">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-soft)] text-xs font-semibold text-white">
                  {q.n
                    .split(" ")
                    .map((s) => s[0])
                    .join("")}
                </div>
                <div>
                  <div className="text-sm font-semibold">{q.n}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {q.r}
                  </div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}

const tiers = [
  {
    name: "Free",
    price: "$0",
    d: "For hobbyists exploring OSS.",
    f: [
      "5 repos / month",
      "Public repos only",
      "Architecture diagrams",
      "Community support",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$19",
    d: "For professional developers.",
    f: [
      "Unlimited public repos",
      "Private repos",
      "Code Q&A + docs",
      "Priority AI",
      "Email support",
    ],
    cta: "Start Pro",
    popular: true,
  },
  {
    name: "Team",
    price: "$49",
    d: "For teams shipping together.",
    f: [
      "Everything in Pro",
      "5 seats included",
      "Shared workspaces",
      "SSO & audit logs",
    ],
    cta: "Start Team",
  },
  {
    name: "Enterprise",
    price: "Custom",
    d: "For platform teams at scale.",
    f: [
      "Self-hosted option",
      "SLA & DPA",
      "Dedicated support",
      "Custom models",
    ],
    cta: "Contact us",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 bg-[var(--surface)] py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Pricing plans"
          desc="Start free. Upgrade when you need private repos or team features."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="group relative flex flex-col rounded-2xl border border-black/5 bg-white p-6 text-[var(--ink)] shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:bg-[var(--night)] hover:text-white hover:shadow-glow"
            >
              {t.popular && (
                <div className="absolute -top-3 left-6 rounded-full bg-[var(--brand)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-glow">
                  Popular
                </div>
              )}
              <div className="font-display text-lg font-semibold">{t.name}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)] transition-colors duration-300 group-hover:text-white/60">
                {t.d}
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold">
                  {t.price}
                </span>
                {t.price !== "Custom" && (
                  <span className="text-sm text-[var(--muted-foreground)] transition-colors duration-300 group-hover:text-white/60">
                    /mo
                  </span>
                )}
              </div>
              <ul className="mt-6 space-y-2.5 text-sm text-[var(--ink)]/80 transition-colors duration-300 group-hover:text-white/80">
                {t.f.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--brand)] transition-colors duration-300 group-hover:bg-[var(--brand-soft)]" />
                    {x}
                  </li>
                ))}
              </ul>
              <Link
                to={t.name === "Enterprise" ? "#contact" : "/login"}
                className="mt-8 rounded-xl bg-[var(--night)] px-4 py-2.5 text-center text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 group-hover:bg-[var(--brand)]"
              >
                {t.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "How does GitLens analyze private repositories?",
    a: "You authorize GitLens via GitHub OAuth with read-only scope. We index metadata and code in-memory, never storing your source.",
  },
  {
    q: "Which languages and frameworks are supported?",
    a: "All major languages: TS/JS, Python, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin, and more. Framework detection covers Next.js, React, Vue, Django, Rails, Spring, and dozens more.",
  },
  {
    q: "How fast is analysis?",
    a: "Most repos complete in under 15 seconds. Monorepos over 1M LOC typically finish in under 90s thanks to smart caching.",
  },
  {
    q: "Is my code safe?",
    a: "Yes. TLS in transit, AES-256 at rest, zero data retention on request, SOC 2 Type II in progress.",
  },
  {
    q: "Do you offer self-hosting?",
    a: "Enterprise customers can deploy GitLens in their own VPC. Contact us for details.",
  },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="scroll-mt-16 py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="FAQ" title="Frequently asked questions" />
        <div className="mt-12 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white shadow-soft">
          {faqs.map((f, i) => (
            <button
              key={f.q}
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="block w-full text-left"
            >
              <div className="flex items-center justify-between px-6 py-5">
                <span className="font-display text-base font-semibold">
                  {f.q}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${open === i ? "rotate-180 text-[var(--brand)]" : ""}`}
                />
              </div>
              <motion.div
                initial={false}
                animate={{
                  height: open === i ? "auto" : 0,
                  opacity: open === i ? 1 : 0,
                }}
                className="overflow-hidden px-6 text-sm text-[var(--muted-foreground)]"
              >
                <div className="pb-5">{f.a}</div>
              </motion.div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[var(--night)] px-8 py-20 text-center text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid-dark opacity-40" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(37,99,235,.5), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Ship code you{" "}
            <span className="text-gradient-brand">actually understand.</span>
          </h2>
          <p className="mt-4 text-white/70">
            Join 12,000+ developers using GitLens to read, review, and ship
            faster.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
            >
              Start free
            </Link>
            <a
              href="#contact"
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/10"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
