import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AppHeader } from "@/components/app/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { normalizeInviteEmail } from "@/lib/invites";

export const Route = createFileRoute("/_authenticated/invitations")({
  component: InvitationsPage,
});

interface ArtistInvite {
  id: string;
  email: string;
  status: "pending" | "consumed" | "revoked";
  created_at: string;
}

const schema = z.object({
  email: z.string().email("Email invalide"),
});
type FormValues = z.infer<typeof schema>;

const STATUS_LABEL: Record<ArtistInvite["status"], string> = {
  pending: "En attente",
  consumed: "Utilisée",
  revoked: "Révoquée",
};

const STATUS_VARIANT: Record<ArtistInvite["status"], "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  consumed: "outline",
  revoked: "destructive",
};

function InvitationsPage() {
  const navigate = useNavigate();
  const { profile, loading, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const { data: invites, refresh } = useCollection<ArtistInvite>("artist_invites");

  useEffect(() => {
    if (!loading && profile && profile.role !== "manager") {
      navigate({ to: "/", replace: true });
    }
  }, [loading, profile, navigate]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (loading || !profile || profile.role !== "manager") return null;

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const email = normalizeInviteEmail(data.email);
      const { error } = await supabase.from("artist_invites").upsert(
        {
          email,
          status: "pending",
          invited_by: user!.id,
          created_at: new Date().toISOString(),
          consumed_at: null,
        },
        { onConflict: "email" },
      );
      if (error) throw error;
      toast.success("Invitation créée");
      reset();
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Impossible de créer l'invitation");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("artist_invites").update({ status: "revoked" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  return (
    <>
      <AppHeader title="Invitations" backTo="/" />
      <div className="px-4 pt-4 pb-24 space-y-6">
        <form
          onSubmit={handleSubmit(submit)}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email de l'artiste</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="artiste@example.com"
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Communique cet email à l'artiste — il pourra créer son compte avec.
          </p>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            Envoyer l'invitation
          </Button>
        </form>

        <div className="space-y-2">
          {invites.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune invitation pour l'instant.
            </p>
          )}
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                <Badge variant={STATUS_VARIANT[inv.status]} className="mt-1">
                  {STATUS_LABEL[inv.status]}
                </Badge>
              </div>
              {inv.status === "pending" && (
                <button
                  onClick={() => revoke(inv.id)}
                  className="shrink-0 text-xs font-medium text-destructive underline underline-offset-4"
                >
                  Révoquer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
