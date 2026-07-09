import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Generic realtime-backed collection hook with optional select (for joins),
// filter, and order. Caches last result in localStorage for offline resilience.

const cacheKey = (table: string, select: string, filter?: Record<string, string | number | boolean>) =>
  `mc-cache:${table}:${select}${filter ? `:${JSON.stringify(filter)}` : ""}`;

function readCache<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeCache<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // storage full / unavailable — ignore
  }
}

interface CollectionOptions {
  select?: string;
  order?: { column: string; ascending?: boolean };
  filter?: Record<string, string | number | boolean>;
}

export function useCollection<T = any>(
  table: string,
  opts: CollectionOptions | { column: string; ascending?: boolean } = {},
) {
  // Normalise: accept legacy { column, ascending } signature too
  const isLegacy = "column" in opts;
  const select = (!isLegacy && (opts as CollectionOptions).select) ? (opts as CollectionOptions).select! : "*";
  const order = isLegacy
    ? (opts as { column: string; ascending?: boolean })
    : ((opts as CollectionOptions).order ?? { column: "created_at", ascending: false });
  const filter = (!isLegacy && (opts as CollectionOptions).filter) ? (opts as CollectionOptions).filter : undefined;

  const ck = cacheKey(table, select, filter);
  const [data, setData] = useState<T[]>(() => readCache<T>(ck));
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(() => {
    fetchRef.current();
  }, []);

  useEffect(() => {
    let active = true;

    const fetchAll = async () => {
      let query = (supabase as any).from(table).select(select);

      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          query = query.eq(key, value);
        }
      }

      query = query.order(order.column, { ascending: order.ascending ?? false });

      const { data: rows, error } = await query;
      if (!active) return;
      if (!error && rows) {
        setData(rows as T[]);
        writeCache<T>(ck, rows as T[]);
      } else {
        setData(readCache<T>(ck));
      }
      setLoading(false);
    };

    fetchRef.current = fetchAll;
    fetchAll();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => fetchAll());

    const onRefresh = () => fetchAll();
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
      .channel(`rt-${table}-${select}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => fetchAll())
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
  }, [table, select, order.column, order.ascending]);

  return { data, loading, refresh };
}
