"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export interface NavBadges {
  /** Requests waiting for a decision. */
  requests: number;
  /** Sessions with a reschedule request waiting. */
  sessions: number;
}

/**
 * Counts for the sidebar badges, fetched in the browser rather than in the
 * layout on the server. Two reasons:
 *
 *  - it keeps these counts off the critical path, so no page render waits on
 *    them; a badge appearing a moment later costs nothing
 *  - Realtime keeps them current, so an admin sees a new request arrive without
 *    reloading
 *
 * No role branching is needed: RLS already limits a client to their own rows,
 * so the same query returns "my pending requests" for a client and "everyone's"
 * for an admin.
 */
export function useNavBadges(userId: string): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({ requests: 0, sessions: 0 });

  const load = useCallback(async () => {
    const supabase = createClient();

    const [requests, sessions] = await Promise.all([
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("cancelled_at", null),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("reschedule_status", "pending"),
    ]);

    setBadges({ requests: requests.count ?? 0, sessions: sessions.count ?? 0 });
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const refresh = () => {
      if (active) load();
    };

    refresh();

    const channel = supabase
      .channel(`nav-badges:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, refresh)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return badges;
}
