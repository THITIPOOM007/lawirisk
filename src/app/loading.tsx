export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูล">
      <div className="h-7 w-44 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="glass-panel rounded-[28px] p-6 sm:p-8">
        <div className="h-3 w-28 animate-pulse rounded bg-teal-300/10" />
        <div className="mt-5 h-9 w-3/4 max-w-xl animate-pulse rounded-xl bg-white/[0.07]" />
        <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-2 h-4 w-2/3 max-w-lg animate-pulse rounded bg-white/[0.04]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="soft-panel h-40 animate-pulse rounded-2xl p-5">
            <div className="h-10 w-10 rounded-xl bg-white/[0.05]" />
            <div className="mt-5 h-3 w-24 rounded bg-white/[0.04]" />
            <div className="mt-3 h-7 w-16 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>
    </div>
  );
}
