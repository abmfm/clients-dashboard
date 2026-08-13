"use client";

import { Bell, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { cx, fill, formatDateTime, titleCase } from "@/lib/utils";

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
        .limit(25);
      if (active && data) setItems(data as Notification[]);
    }

    load();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 25))
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

  /**
   * Renders in the reader's current language.
   *
   * Rows carry a template key and its parameters rather than a finished
   * sentence, because the sentence has to be written at read time - the
   * language is a property of who is looking, not of when it happened. Older
   * rows without a template fall back to the English text stored with them.
   */
  function render(n: Notification) {
    const key = n.template ?? "";
    const titles = t.notify.titles as Record<string, string>;
    const bodies = t.notify.bodies as Record<string, string>;

    if (!key || !bodies[key]) return { title: n.title, message: n.message };

    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.params ?? {})) {
      if (k === "when" && typeof v === "string") params[k] = formatDateTime(v, locale);
      else if (k === "status" && typeof v === "string")
        params[k] = (t.status as Record<string, string>)[v] ?? titleCase(v);
      else params[k] = String(v ?? "");
    }

    return { title: titles[key] ?? n.title, message: fill(bodies[key], params).trim() };
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }

  async function clearAll() {
    setItems([]);
    await supabase.from("notifications").delete().eq("user_id", userId);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        aria-label={t.notify.heading}
      >
        <Bell size={20} />
        {unread > 0 ? (
          <span
            className="absolute end-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
            style={{ animation: "pulse-ring 2s var(--ease-out) infinite" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="anim-slide-down absolute end-0 z-40 mt-2 w-[min(330px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink-200/70 bg-surface shadow-pop">
          <div className="flex items-center justify-between gap-2 border-b border-ink-200/70 px-4 py-3">
            <p className="text-[14px] font-semibold text-ink-900">{t.notify.heading}</p>
            <div className="flex items-center gap-3">
              {unread > 0 ? (
                <button
                  onClick={markAllRead}
                  className="text-[12.5px] font-medium text-brand-600 hover:underline"
                >
                  {t.common.markAllRead}
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-400 transition hover:text-rose-600"
                >
                  <Trash2 size={13} />
                  {t.notify.clearAll}
                </button>
              ) : null}
            </div>
          </div>

          <ul className="max-h-[340px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-ink-400">
                {t.common.noNotifications}
              </li>
            ) : (
              items.map((n, i) => {
                const { title, message } = render(n);

                return (
                  <li
                    key={n.id}
                    className={cx(
                      "anim-fade-in stagger group relative border-b border-ink-100 px-4 py-3 transition-colors last:border-0 hover:bg-ink-50",
                      !n.is_read && "bg-brand-50/50"
                    )}
                    style={{ "--d": `${i * 35}ms` } as React.CSSProperties}
                  >
                    <button
                      onClick={() => remove(n.id)}
                      className="absolute end-2 top-2 rounded-lg p-1 text-ink-300 opacity-0 transition hover:bg-ink-200 hover:text-ink-700 focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={t.notify.delete}
                      title={t.notify.delete}
                    >
                      <X size={13} />
                    </button>

                    <p className="pe-6 text-[13.5px] font-medium text-ink-900">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{message}</p>
                    <p className="ltr-nums mt-1 text-[11.5px] text-ink-400">
                      {formatDateTime(n.created_at, locale)}
                    </p>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
