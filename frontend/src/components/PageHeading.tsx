export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex w-full flex-wrap items-start justify-between gap-4">
      <div className="anim-fade-up min-w-0">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[28px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-[14.5px] text-ink-500">{subtitle}</p> : null}
      </div>
      <div className="anim-fade-up stagger" style={{ "--d": "80ms" } as React.CSSProperties}>
        {action}
      </div>
    </div>
  );
}
