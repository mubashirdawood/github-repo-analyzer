/** Pulsing gray placeholders for architecture summary + diagram. */
export default function ArchitectureSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading architecture">
      <section>
        <div className="h-4 w-40 bg-zinc-200 rounded mb-4" />
        <div className="space-y-2.5">
          <div className="h-3 w-full bg-zinc-100 rounded" />
          <div className="h-3 w-[92%] bg-zinc-100 rounded" />
          <div className="h-3 w-[85%] bg-zinc-100 rounded" />
          <div className="h-3 w-full bg-zinc-100 rounded" />
          <div className="h-3 w-[70%] bg-zinc-100 rounded" />
          <div className="h-3 w-[88%] bg-zinc-100 rounded mt-4" />
          <div className="h-3 w-[60%] bg-zinc-100 rounded" />
        </div>
      </section>
      <section>
        <div className="h-4 w-36 bg-zinc-200 rounded mb-4" />
        <div className="h-48 w-full rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center">
          <div className="space-y-3 w-[70%]">
            <div className="flex justify-center gap-6">
              <div className="h-8 w-24 bg-zinc-200 rounded" />
              <div className="h-8 w-24 bg-zinc-200 rounded" />
            </div>
            <div className="flex justify-center">
              <div className="h-8 w-28 bg-zinc-200 rounded" />
            </div>
            <div className="flex justify-center gap-4">
              <div className="h-8 w-20 bg-zinc-200 rounded" />
              <div className="h-8 w-20 bg-zinc-200 rounded" />
              <div className="h-8 w-20 bg-zinc-200 rounded" />
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-400 text-center mt-3">Generating architecture…</p>
      </section>
    </div>
  )
}
