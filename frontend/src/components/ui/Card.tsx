import { cx } from "@/lib/utils";

export function Card({
  className,
  delay = 0,
  hover = false,
  children,
}: {
  className?: string;
  /** Stagger index, in ms, for the entrance animation. */
  delay?: number;
  hover?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cx("card anim-fade-up stagger", hover && "card-hover", className)}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="section-sub">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
