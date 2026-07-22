import { Bell, ChevronLeft, LogOut, UserPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_SHORT } from "@/lib/constants";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
interface Notif {
  id: string;
  recipient_role: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export function AppHeader({ title, subtitle, backTo }: { title: string; subtitle?: string; backTo?: string }) {
  const { profile, signOut } = useAuth();
  const { data: notifs } = useCollection<Notif>("notifications");

  const mine = notifs.filter((n) => n.recipient_role === profile?.role);
  const unread = mine.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    const ids = mine.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length) await supabase.from("notifications").update({ is_read: true }).in("id", ids);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-5 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {backTo && (
            <Link
              to={backTo}
              aria-label="Retour"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl text-foreground">{title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Sheet onOpenChange={(o) => o && markAllRead()}>
            <SheetTrigger asChild>
              <button
                className="relative grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
                aria-label={
                  unread > 0
                    ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}`
                    : "Notifications"
                }
              >
                <Bell className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
                {unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold text-destructive-foreground"
                  >
                    {unread}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] sm:w-96">
              <SheetHeader>
                <SheetTitle className="font-display text-xl">Notifications</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2 overflow-y-auto no-scrollbar">
                {mine.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Aucune notification.
                  </p>
                )}
                {mine.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3 ${
                      n.is_read ? "border-border bg-card" : "border-gold/30 bg-gold/5"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    {n.body && (
                      <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-1.5 text-[0.65rem] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          {profile?.role === "manager" && (
            <Link
              to="/invitations"
              aria-label="Invitations"
              className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
            >
              <UserPlus className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
            </Link>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
                aria-label="Déconnexion"
              >
                <LogOut className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Se déconnecter ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tu devras te reconnecter pour accéder à ton espace.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={signOut}>Se déconnecter</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {subtitle && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {subtitle}
          {profile && (
            <span className="text-gold"> · {ROLE_SHORT[profile.role] ?? profile.display_name}</span>
          )}
        </p>
      )}
    </header>
  );
}
