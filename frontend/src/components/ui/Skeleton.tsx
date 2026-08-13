export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 pb-4 pt-6">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-2 h-3 w-64" />
      </div>
      <div className="space-y-px px-6 pb-6">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3.5">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="skeleton h-3 flex-1" style={{ maxWidth: 200 }} />
            <div className="skeleton h-5 w-24 rounded-lg" />
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="anim-fade-in">
      <div className="mb-6">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton mt-2.5 h-3.5 w-80" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="card card-pad">
            <div className="flex items-start gap-4">
              <div className="skeleton h-11 w-11 rounded-xl" />
              <div className="flex-1">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton mt-2.5 h-7 w-12" />
              </div>
            </div>
            <div className="skeleton mt-4 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={4} />
      </div>
    </div>
  );
}
