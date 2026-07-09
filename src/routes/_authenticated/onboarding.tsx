import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [commissionStart, setCommissionStart] = useState("2025-01-01");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && profile?.onboarded) {
      navigate({ to: "/cachets", replace: true });
    }
  }, [loading, profile, navigate]);

  if (loading || !profile) return null;

  // Artist onboarding: just show PWA install instructions
  if (profile.role === "artist") {
    return (
      <div className="flex min-h-[100dvh] flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-card border border-border">
            <Smartphone className="h-10 w-10 text-foreground" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Installe l'app
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Pour recevoir les notifications de tes cachets et tâches, ajoute cette app à ton écran d'accueil.
          </p>
          <div className="mt-6 space-y-3 text-left rounded-2xl bg-card border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">iOS (Safari)</p>
            <p className="text-sm text-foreground">Appuie sur le bouton <strong>Partager</strong> puis <strong>"Sur l'écran d'accueil"</strong></p>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3">Android (Chrome)</p>
            <p className="text-sm text-foreground">Appuie sur le menu <strong>⋮</strong> puis <strong>"Ajouter à l'écran d'accueil"</strong></p>
          </div>
          <Button
            className="mt-8 w-full rounded-full"
            size="lg"
            onClick={async () => {
              await supabase.from("profiles").update({ onboarded: true }).eq("user_id", user!.id);
              await refreshProfile();
              navigate({ to: "/cachets", replace: true });
            }}
          >
            C'est fait, continuer
          </Button>
          <button
            className="mt-3 text-sm text-muted-foreground underline underline-offset-4"
            onClick={async () => {
              await supabase.from("profiles").update({ onboarded: true }).eq("user_id", user!.id);
              await refreshProfile();
              navigate({ to: "/cachets", replace: true });
            }}
          >
            Ignorer pour l'instant
          </button>
        </div>
      </div>
    );
  }

  // Manager onboarding: set commission_start_date
  const confirm = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          commission_start_date: commissionStart,
          onboarded: true,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Bienvenue !");
      navigate({ to: "/cachets", replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Bienvenue, Paul.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une seule info pour démarrer : depuis quelle date gères-tu BLOU FEET ?
        </p>
        <div className="mt-8 space-y-2">
          <Label htmlFor="commission-start">Date de début de commission</Label>
          <Input
            id="commission-start"
            type="date"
            value={commissionStart}
            onChange={(e) => setCommissionStart(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Utilisée pour calculer le taux de contrôle et filtrer les fees.
          </p>
        </div>
        <Button
          className="mt-8 w-full rounded-full"
          size="lg"
          disabled={busy}
          onClick={confirm}
        >
          Démarrer
        </Button>
      </div>
    </div>
  );
}
