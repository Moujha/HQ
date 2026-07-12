import { useState, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Upload } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { parseSacemCsv, type SacemParseResult } from "@/lib/sacem-parser";

const SUPPORT_LABEL: Record<string, string> = {
  streaming: "Streaming",
  plateforme_web: "Web",
  live: "Live",
  radio_tv: "Radio/TV",
  sync: "Sync",
  autre: "Autre",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function SacemImportDrawer({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<SacemParseResult | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = parseSacemCsv(text);
        if (parsed.lines.length === 0) {
          toast.error("Aucune ligne valide trouvée dans ce fichier");
          return;
        }
        setResult(parsed);
        const periodStr = parsed.periods.join(", ");
        setNotes(`SACEM répartition ${parsed.repartition}${periodStr ? ` – ${periodStr}` : ""}`);
      } catch {
        toast.error("Erreur lors de la lecture du fichier");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    try {
      // 1. Get artist id from current session
      const artistId = profile?.id ?? null;
      if (!artistId) throw new Error("Profil introuvable — reconnectez-vous");

      // 2. Fetch existing tracks that have a sacem_code
      const { data: existingTracks, error: tracksErr } = await supabase
        .from("tracks")
        .select("id, sacem_code, is_commissionable");
      if (tracksErr) throw tracksErr;

      const codeToTrack = new Map<string, { id: string; is_commissionable: boolean }>();
      for (const t of existingTracks ?? []) {
        if (t.sacem_code) codeToTrack.set(t.sacem_code, t);
      }

      // 3. Create stub tracks for unmatched sacem_codes
      const seenCodes = new Set<string>();
      const toCreate: { title: string; sacem_code: string }[] = [];
      for (const line of result.lines) {
        if (!codeToTrack.has(line.sacem_code) && !seenCodes.has(line.sacem_code)) {
          seenCodes.add(line.sacem_code);
          toCreate.push({ title: line.raw_title, sacem_code: line.sacem_code });
        }
      }

      if (toCreate.length > 0) {
        const { data: newTracks, error: newErr } = await supabase
          .from("tracks")
          .insert(
            toCreate.map((t) => ({
              title: t.title,
              sacem_code: t.sacem_code,
              sacem_status: "déclaré" as const,
              is_commissionable: false,
            }))
          )
          .select("id, sacem_code, is_commissionable");
        if (newErr) throw newErr;
        for (const t of newTracks ?? []) {
          if (t.sacem_code) codeToTrack.set(t.sacem_code, t);
        }
      }

      // 4. Insert SACEM payment
      const { data: payment, error: payErr } = await supabase
        .from("payments")
        .insert({
          artist_id: artistId,
          source: "sacem" as const,
          amount: result.total,
          payment_date: paymentDate || null,
          notes,
          status: "payé" as const,
          territory: "france" as const,
          counts_for_intermittence: false,
          deductible_expenses: 0,
        })
        .select("id")
        .single();
      if (payErr) throw payErr;

      // 5. Insert payment_lines
      const paymentLines = result.lines.map((l) => {
        const track = codeToTrack.get(l.sacem_code);
        return {
          payment_id: payment.id,
          track_id: track?.id ?? null,
          sacem_code: l.sacem_code,
          raw_title: l.raw_title,
          support_type: l.support_type,
          amount: l.amount,
          is_commissionable: track?.is_commissionable ?? false,
        };
      });

      const { error: linesErr } = await supabase.from("payment_lines").insert(paymentLines);
      if (linesErr) throw linesErr;

      toast.success(
        `SACEM importé — ${result.lines.length} lignes, ${result.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
      );
      setResult(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setBusy(false);
    }
  }

  function handleClose(v: boolean) {
    if (!v) setResult(null);
    onOpenChange(v);
  }

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Importer SACEM</DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-8 space-y-5 no-scrollbar">
          {!result ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-16 cursor-pointer transition hover:border-foreground/40 active:bg-muted"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Glisse le fichier CSV SACEM ici
                <br />
                <span className="text-xs">ou clique pour parcourir</span>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Répartition {result.repartition}
                  </span>
                  <span className="font-display text-xl font-bold text-foreground">
                    {result.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.lines.length} lignes · {result.periods.join(", ")}
                </p>
              </div>

              {/* Date + notes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sacem-date">Date de paiement</Label>
                  <Input
                    id="sacem-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sacem-notes">Notes</Label>
                  <Input
                    id="sacem-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Lines preview */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  Détail par titre
                </p>
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {result.lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{l.raw_title}</p>
                        <p className="text-xs text-muted-foreground">{SUPPORT_LABEL[l.support_type]}</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                        {l.amount.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                className="w-full rounded-full"
                size="lg"
                disabled={busy}
                onClick={confirm}
              >
                {busy
                  ? "Import en cours…"
                  : `Importer ${result.total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`}
              </Button>

              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline"
                onClick={() => setResult(null)}
              >
                Changer de fichier
              </button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
