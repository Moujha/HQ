import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";

// Pull-to-refresh, comme sur les apps natives : quand l'utilisateur est en haut
// de l'écran et tire vers le bas avec son doigt, on déclenche une actualisation
// des données (via l'événement "mc-refresh" écouté par useCollection).

const THRESHOLD = 70; // distance à tirer avant de déclencher
const MAX_PULL = 110; // distance visuelle max

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const canPull = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (refreshing || !canPull()) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      if (!canPull()) {
        active.current = false;
        setPull(0);
        return;
      }
      // Résistance : le geste ralentit à mesure qu'on tire.
      const resisted = Math.min(MAX_PULL, delta * 0.5);
      setPull(resisted);
      if (resisted > 5) e.preventDefault();
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.dispatchEvent(new Event("mc-refresh"));
        window.setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, 900);
      } else {
        setPull(0);
      }
      startY.current = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, refreshing]);

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div className="relative">
      <div
        aria-hidden={!refreshing && pull === 0}
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center"
        style={{ height: pull, opacity: pull > 0 || refreshing ? 1 : 0 }}
      >
        <span
          className="mt-2 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-gold shadow-lg"
          style={{
            transform: `translateY(${Math.max(0, pull - 40)}px)`,
          }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDown
              className="h-4 w-4 transition-transform"
              style={{ transform: `rotate(${progress * 180}deg)` }}
            />
          )}
        </span>
      </div>
      <div
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: active.current ? "none" : "transform 0.25s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
