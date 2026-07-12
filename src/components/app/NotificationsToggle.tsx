import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  enablePush,
  disablePush,
  getPushStatus,
  type PushStatus,
} from "@/lib/push-client";

const STATUS_META: Record<
  PushStatus,
  { label: string; className: string }
> = {
  granted: {
    label: "Autorisée",
    className: "bg-primary/15 text-primary",
  },
  denied: {
    label: "Refusée",
    className: "bg-destructive/15 text-destructive",
  },
  default: {
    label: "En attente",
    className: "bg-muted text-muted-foreground",
  },
  "ios-not-installed": {
    label: "À installer",
    className: "bg-muted text-muted-foreground",
  },
  unsupported: {
    label: "Non compatible",
    className: "bg-muted text-muted-foreground",
  },
};

export function NotificationsToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStatus(await getPushStatus());

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const onEnable = async () => {
    setBusy(true);
    try {
      const res = await enablePush();
      if (res.ok) {
        toast.success("Notifications activées");
      } else if (res.reason === "ios-not-installed") {
        toast.error("Ajoutez d'abord l'app à l'écran d'accueil");
      } else if (res.reason === "denied") {
        toast.error("Notifications refusées dans les réglages");
      } else if (res.reason === "timeout") {
        toast.error("Délai dépassé", {
          description: "Vérifiez votre connexion et réessayez.",
        });
      } else if (res.reason === "unsupported") {
        toast.error("Notifications non disponibles sur cet appareil");
      } else {
        toast.error("Impossible d'activer les notifications", {
          description: "Une erreur est survenue. Réessayez.",
        });
      }
    } catch {
      toast.error("Impossible d'activer les notifications");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const onDisable = async () => {
    setBusy(true);
    try {
      await disablePush();
      toast("Notifications désactivées");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  if (status === null) return null;

  const meta = STATUS_META[status];
  const enabled = status === "granted";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              Notifications push
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Décisions, commentaires et deadlines urgentes, directement sur votre
            iPhone.
          </p>

          {status === "unsupported" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Cet appareil ne prend pas en charge les notifications push.
            </p>
          ) : status === "ios-not-installed" ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Sur iPhone : appuyez sur{" "}
              <span className="font-medium text-foreground">Partager</span> puis{" "}
              <span className="font-medium text-foreground">
                « Sur l'écran d'accueil »
              </span>
              , ouvrez l'app installée et revenez ici pour activer.
            </p>
          ) : status === "denied" ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Les notifications sont bloquées. Autorisez-les dans les réglages de
              votre iPhone (Réglages → BLOU FEET → Notifications).
            </p>
          ) : enabled ? (
            <button
              onClick={onDisable}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-xs font-medium text-foreground disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
              Désactiver
            </button>
          ) : (
            <button
              onClick={onEnable}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              {busy ? "Activation…" : "Activer les notifications"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Backwards-compatible alias used by the cockpit route.
export const n = NotificationsToggle;
