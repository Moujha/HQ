import { Link, useRouterState } from "@tanstack/react-router";
import {
  Music2,
  TrendingUp,
  FileText,
  CheckSquare,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const CACHETS = { to: "/cachets", label: "Cachets", icon: Music2 } as const;
const FEES = { to: "/fees", label: "Fees", icon: TrendingUp } as const;
const FACTURES = { to: "/factures", label: "Factures", icon: FileText } as const;
const TACHES = { to: "/taches", label: "Tâches", icon: CheckSquare } as const;
const CALENDRIER = { to: "/calendrier", label: "Agenda", icon: Calendar } as const;

const MANAGER_PRIMARY = [CACHETS, FEES, FACTURES, TACHES] as const;
const ARTIST_PRIMARY = [CACHETS, TACHES, CALENDRIER] as const;

const MANAGER_MORE = [
  { to: "/calendrier", label: "Agenda" },
  { to: "/tracks", label: "Tracks" },
  { to: "/subventions", label: "Subventions" },
] as const;

export function BottomNav() {
  const { profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const isManager = profile?.role === "manager";
  const primaryTabs = isManager ? MANAGER_PRIMARY : ARTIST_PRIMARY;

  const moreActive = isManager
    ? MANAGER_MORE.some((t) => pathname.startsWith(t.to))
    : false;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {primaryTabs.map((t) => {
          const active = pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[0.64rem] font-medium transition ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={active ? 2.4 : 1.8}
                aria-hidden="true"
              />
              {t.label}
            </Link>
          );
        })}

        {isManager && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[0.64rem] font-medium transition ${
                  moreActive ? "text-foreground" : "text-muted-foreground"
                }`}
                aria-label="Plus de modules"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                Plus
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
              <SheetHeader className="mb-4">
                <SheetTitle className="font-display text-lg">Modules</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 pb-4">
                {MANAGER_MORE.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border py-4 text-sm font-medium transition ${
                      pathname.startsWith(item.to)
                        ? "border-foreground/30 bg-card text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
