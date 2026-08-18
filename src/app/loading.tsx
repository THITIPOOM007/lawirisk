export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูล">
      <div className="glass-panel relative min-h-[360px] overflow-hidden rounded-[30px] p-6 sm:p-8 lg:p-11">
        <div className="scan-line absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-teal-200/40 to-transparent" />
        <div className="skeleton-shimmer h-7 w-52 rounded-full" />
        <div className="mt-7 h-10 w-3/4 max-w-xl rounded-xl skeleton-shimmer" />
        <div className="mt-3 h-10 w-2/3 max-w-lg rounded-xl skeleton-shimmer" />
        <div className="mt-6 h-4 w-full max-w-2xl rounded skeleton-shimmer" />
        <div className="mt-3 h-4 w-2/3 max-w-lg rounded skeleton-shimmer" />
        <div className="mt-8 flex gap-3"><div className="h-12 w-40 rounded-xl skeleton-shimmer" /><div className="h-12 w-44 rounded-xl skeleton-shimmer" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="soft-panel h-44 rounded-[22px] p-5">
            <div className="h-11 w-11 rounded-xl skeleton-shimmer" />
            <div className="mt-5 h-3 w-24 rounded skeleton-shimmer" />
            <div className="mt-3 h-8 w-16 rounded-lg skeleton-shimmer" />
            <div className="mt-4 h-2.5 w-32 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>
    </div>
  );
}
