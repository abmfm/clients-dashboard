"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Rendered through a portal into <body>.
 *
 * This matters: `position: fixed` is resolved against the nearest ancestor that
 * has a transform, filter or backdrop-filter - not the viewport. The page
 * wrapper animates `transform`, so an in-tree dialog was being positioned and
 * clipped by that wrapper instead of the window. A portal removes the dialog
 * from that subtree entirely, so it can never happen again no matter what
 * effects get added to the layout later.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Compensate for the scrollbar so the page behind does not shift.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingInlineEnd;

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingInlineEnd = `${gap}px`;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingInlineEnd = previousPadding;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto overscroll-contain p-0 sm:items-center sm:p-6">
      <div
        className="anim-fade-in fixed inset-0 bg-ink-900/40 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-scale-in relative z-10 my-0 w-full sm:my-auto ${maxWidth} rounded-t-2xl bg-surface shadow-pop sm:rounded-2xl`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-ink-200/70 bg-surface px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink-900">{title}</h3>
            {subtitle ? <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="-me-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:rotate-90 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
