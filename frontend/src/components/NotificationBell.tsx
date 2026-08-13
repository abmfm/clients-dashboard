"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { cx } from "@/lib/utils";

export function NotificationBell({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (active && data) setItems(data as Notification[]);
    }

    load();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 15))
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 ? (
          <span
            className="absolute end-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-canvas"
            style={{ animation: "pulse-ring 2s var(--ease-out) infinite" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="anim-slide-down absolute end-0 z-40 mt-2 w-[330px] overflow-hidden rounded-2xl border border-ink-200/70 bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-200/70 px-4 py-3">
            <p className="text-[14px] font-semibold text-ink-900">{t.common.notifications}</p>
            {unread > 0 ? (
              <button onClick={markAllRead} className="text-[12.5px] font-medium text-brand-600 hover:underline">
                {t.common.markAllRead}
              </button>
            ) : null}
          </div>

          <ul className="max-h-[340px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-ink-400">{t.common.noNotifications}</li>
            ) : (
              items.map((n, i) => (
                <li
                  key={n.id}
                  className={cx(
                    "anim-fade-in stagger border-b border-ink-100 px-4 py-3 transition-colors last:border-0 hover:bg-ink-50",
                    !n.is_read && "bg-brand-50/50"
                  )}
                  style={{ "--d": `${i * 35}ms` } as React.CSSProperties}
                >
                  <p className="text-[13.5px] font-medium text-ink-900">{n.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{n.message}</p>
                  <p className="ltr-nums mt-1 text-[11.5px] text-ink-400">
                    {new Date(n.created_at).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
