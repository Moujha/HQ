import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Generic realtime-backed collection hook. Fetches a table ordered by `orderBy`
// and live-syncs via Postgres changes so both users see updates instantly.
//
// Instant local updates: mutations dispatch a "mc-refresh" window event (via
// refreshCollections()), so a user's own action (new demande / tâche / news)
// is reflected on screen immediately, even if the realtime channel is slow.
//
// For weak/offline connections, the last successful result is cached in
// localStorage and used as the initial value + fallback when a fetch fails.

const cacheKey = (table: string) => `mc-cache:${table}`;

function readCache<T>(table: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cacheKey(table));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeCache<T>(table: string, rows: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(table), JSON.stringify(rows));
  } catch {
    // storage full / unavailable — ignore
  }
}

export function useCollection<T = any>(
  table: string,
  orderBy: { column: string; ascending?: boolean } = {
    column: "created_at",
    ascending: false,
  },
) {
  const [data, setData] = useState<T[]>(() => readCache<T>(table));
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(() => {
    fetchRef.current();
  }, []);

  useEffect(() => {
    let active = true;

    const fetchAll = async () => {
      const { data: rows, error } = await (supabase as any)
        .from(table)
        .select("*")
        .order(orderBy.column, { ascending: orderBy.ascending ?? false });
      if (!active) return;
      if (!error && rows) {
        setData(rows as T[]);
        writeCache<T>(table, rows as T[]);
      } else {
        // Offline / weak connection: keep the cached copy on screen.
        setData(readCache<T>(table));
      }
      setLoading(false);
    };

    fetchRef.current = fetchAll;
    fetchAll();

    // Refetch when the auth session becomes available / changes, so the first
    // render right after sign-in doesn't get stuck on an empty (pre-auth) fetch.
    const { data: authSub } = supabase.auth.onAuthStateChange(() => fetchAll());

    // Explicit refresh fallback: mutations dispatch "mc-refresh" so the list
    // updates immediately even if the realtime channel is slow or unavailable.
    const onRefresh = () => fetchAll();
    // Also re-sync when the app/tab regains focus or the connection returns.
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("mc-refresh", onRefresh);
      window.addEventListener("focus", onRefresh);
      window.addEventListener("online", onRefresh);
      document.addEventListener("visibilitychange", onVisible);
    }

    const channel = supabase
      .channel(`rt-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("mc-refresh", onRefresh);
        window.removeEventListener("focus", onRefresh);
        window.removeEventListener("online", onRefresh);
        document.removeEventListener("visibilitychange", onVisible);
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, orderBy.column, orderBy.ascending]);

  return { data, loading, refresh };
}
