import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Step = "method" | "type" | "amount" | "details" | "review";
type RevenueType = "booking" | "répétition" | "formation" | "accompagnement" | "figuration" | "résidence" | "clip" | "track" | "label";
type StatusType = "provisoire" | "cachet_en_attente" | "payé";
type TerritoryType = "france" | "étranger";

// Types qui comptent pour l'intermittence
const INTERMITTENCE_TYPES: RevenueType[] = [
  "booking", "répétition", "formation", "accompagnement", "figuration", "résidence", "clip",
];

const TYPE_OPTIONS: { value: RevenueType; label: string; emoji: string }[] = [
  { value: "booking",        label: "Concert / Spectacle", emoji: "🎤" },
  { value: "répétition",     label: "Répétition",          emoji: "🎸" },
  { value: "formation",      label: "Formation / Atelier", emoji: "🎓" },
  { value: "accompagnement", label: "Accompagnement",      emoji: "🎹" },
  { value: "figuration",     label: "Figuration",          emoji: "🎬" },
  { value: "résidence",      label: "Résidence",           emoji: "🏠" },
  { value: "clip",           label: "Clip",                emoji: "📹" },
  { value: "track",          label: "Nouvelle track",       emoji: "🎵" },
  { value: "label",          label: "Label / Droits",      emoji: "🏷" },
];

const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "payé", label: "Payé" },
];

interface FormState {
  type: RevenueType;
  notes: string;
  amount: string;
  payment_date: string;
  status: StatusType;
  hours: number;
  batchCount: number;
  territory: TerritoryType;
  counts_for_intermittence: boolean;
  deductible_expenses: string;
}

const DEFAULT_FORM: FormState = {
  type: "booking",
  notes: "",
  amount: "",
  payment_date: new Date().toISOString().split("T")[0],
  status: "payé",
  hours: 12,
  batchCount: 1,
  territory: "france",
  counts_for_intermittence: true,
  deductible_expenses: "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSacemRequested?: () => void;
  initialType?: RevenueType;
  onSuccess?: () => void;
}

export function AddRevenueSheet({
  open,
  onOpenChange,
  onSacemRequested,
  initialType,
  onSuccess,
}: Props) {
  const { user, profile } = useAuth();

  const HOURS_PER_CACHET = 12;
  const [hoursMode, setHoursMode] = useState<"cachets" | "heures">("cachets");

  const firstStep: Step = initialType ? "amount" : "method";

  const [step, setStep] = useState<Step>(firstStep);
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    type: initialType ?? "booking",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function resetAndClose() {
    setStep(firstStep);
    setForm({ ...DEFAULT_FORM, type: initialType ?? "booking" });
    setFieldErrors({});
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetAndClose();
    onOpenChange(v);
  }

  function goBack() {
    if (step === "type") setStep("method");
    else if (step === "amount") setStep(initialType ? "method" : "type");
    else if (step === "details") setStep("amount");
    else if (step === "review") setStep("details");
  }

  function goNext() {
    if (step === "amount") {
      const errs: Partial<Record<keyof FormState, string>> = {};
      if (!form.notes.trim()) errs.notes = "Requis";
      if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = "Montant invalide";
      if (Object.keys(errs).length) {
        setFieldErrors(errs);
        return;
      }
      setStep("details");
      return;
    }
    if (step === "details") { setStep("review"); return; }
    if (step === "review") { void submitForm(); }
  }

  async function submitForm() {
    setBusy(true);
    try {
      const artistId = profile?.id ?? null;
      if (!artistId) throw new Error("Profil introuvable — reconnectez-vous");

      const isIntermittence = INTERMITTENCE_TYPES.includes(form.type);

      // Créer le track en premier pour récupérer son id
      let track_id: string | null = null;
      if (form.type === "track") {
        const { data: newTrack, error: trackErr } = await supabase
          .from("tracks")
          .insert({ title: form.notes, is_commissionable: true, sacem_status: "non_déclaré" })
          .select("id")
          .single();
        if (trackErr) throw trackErr;
        track_id = newTrack.id;
      }

      let batch_id: string | null = null;
      if (form.type === "booking" && form.batchCount > 1) {
        const { data: batch, error: batchErr } = await supabase
          .from("payment_batches")
          .insert({ batch_count: form.batchCount, label: form.notes })
          .select("id")
          .single();
        if (batchErr) throw batchErr;
        batch_id = batch.id;
      }

      const { error } = await supabase.from("payments").insert({
        artist_id: artistId,
        track_id,
        source: form.type,
        notes: form.notes,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date || null,
        status: form.status,
        territory: form.type === "booking" ? form.territory : ("france" as const),
        counts_for_intermittence: isIntermittence ? form.counts_for_intermittence : false,
        deductible_expenses: parseFloat(form.deductible_expenses) || 0,
        hours: isIntermittence ? form.hours : 12,
        batch_id,
        created_by: user?.id,
      });
      if (error) throw error;

      toast.success("Revenu ajouté");
      window.dispatchEvent(new Event("mc-refresh"));
      resetAndClose();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const STEP_ORDER: Step[] = initialType
    ? ["amount", "details", "review"]
    : ["type", "amount", "details", "review"];
  const progress = STEP_ORDER.indexOf(step);
  const showProgress = step !== "method";

  const stepTitle: Record<Step, string> = {
    method: "Ajouter un revenu",
    type: "Type de revenu",
    amount: "Montant & date",
    details: INTERMITTENCE_TYPES.includes(form.type) ? "Détails cachet" : "Détails",
    review: "Récapitulatif",
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="flex items-center gap-3">
          {step !== "method" && (
            <button
              type="button"
              onClick={goBack}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <DrawerTitle className="font-display text-xl flex-1">
            {stepTitle[step]}
          </DrawerTitle>
        </DrawerHeader>

        {showProgress && (
          <div className="flex justify-center gap-1.5 pb-2">
            {STEP_ORDER.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  i <= progress ? "bg-foreground" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        <div className="overflow-y-auto px-4 pb-8 space-y-4 no-scrollbar">
          {/* ── Method ── */}
          {step === "method" && (
            <div className="space-y-3">
              <button
                onClick={() => setStep("type")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition active:scale-[0.98]"
              >
                <span className="text-xl">✏️</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Saisie manuelle</p>
                  <p className="text-xs text-muted-foreground">Cachet, label, clip, résidence…</p>
                </div>
              </button>
              <button
                onClick={() => {
                  handleOpenChange(false);
                  onSacemRequested?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition active:scale-[0.98]"
              >
                <span className="text-xl">📄</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Import SACEM CSV</p>
                  <p className="text-xs text-muted-foreground">Répartition complète</p>
                </div>
              </button>
              {(
                [
                  { emoji: "🏦", label: "Relevé bancaire", sub: "Import CSV de ta banque" },
                  { emoji: "📸", label: "Photo / OCR", sub: "Contrat, virement, mail…" },
                ] as const
              ).map((item) => (
                <div
                  key={item.label}
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 opacity-40"
                >
                  <span className="text-xl">{item.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
                    Bientôt
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Type ── */}
          {step === "type" && (
            <div className="grid grid-cols-2 gap-3">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    patch("type", opt.value);
                    patch("counts_for_intermittence", INTERMITTENCE_TYPES.includes(opt.value));
                    setHoursMode("cachets");
                    setStep("amount");
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-6 text-sm font-medium text-muted-foreground transition active:scale-[0.98]"
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Amount ── */}
          {step === "amount" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rev-notes">Intitulé</Label>
                <Input
                  id="rev-notes"
                  placeholder="ex: Concert La Cigale"
                  value={form.notes}
                  onChange={(e) => patch("notes", e.target.value)}
                />
                {fieldErrors.notes && (
                  <p className="text-xs text-destructive">{fieldErrors.notes}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rev-amount">Montant (€)</Label>
                  <Input
                    id="rev-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => patch("amount", e.target.value)}
                  />
                  {fieldErrors.amount && (
                    <p className="text-xs text-destructive">{fieldErrors.amount}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rev-date">Date</Label>
                  <Input
                    id="rev-date"
                    type="date"
                    value={form.payment_date}
                    onChange={(e) => patch("payment_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch("status", opt.value)}
                      className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                        form.status === opt.value
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full rounded-full" size="lg" onClick={goNext}>
                Suivant →
              </Button>
            </div>
          )}

          {/* ── Details: Intermittence types ── */}
          {step === "details" && INTERMITTENCE_TYPES.includes(form.type) && (() => {
            const cachetCount = Math.max(1, Math.round(form.hours / HOURS_PER_CACHET));
            const setCachetCount = (n: number) => patch("hours", Math.max(1, n) * HOURS_PER_CACHET);
            return (
              <div className="space-y-5">
                {/* Cachets / Heures toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Durée</Label>
                    <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (hoursMode === "heures") {
                            patch("hours", Math.max(1, Math.round(form.hours / HOURS_PER_CACHET)) * HOURS_PER_CACHET);
                          }
                          setHoursMode("cachets");
                        }}
                        className={`rounded-full px-3 py-1 font-medium transition ${
                          hoursMode === "cachets"
                            ? "bg-foreground text-background"
                            : "text-muted-foreground"
                        }`}
                      >
                        Cachets
                      </button>
                      <button
                        type="button"
                        onClick={() => setHoursMode("heures")}
                        className={`rounded-full px-3 py-1 font-medium transition ${
                          hoursMode === "heures"
                            ? "bg-foreground text-background"
                            : "text-muted-foreground"
                        }`}
                      >
                        Heures
                      </button>
                    </div>
                  </div>

                  {hoursMode === "cachets" ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCachetCount(cachetCount - 1)}
                        disabled={cachetCount <= 1}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="text-center">
                        <span className="text-lg font-semibold text-foreground">{cachetCount}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          cachet{cachetCount > 1 ? "s" : ""} · {cachetCount * HOURS_PER_CACHET} h
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCachetCount(cachetCount + 1)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => patch("hours", Math.max(1, form.hours - 1))}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="text-center">
                        <span className="text-lg font-semibold text-foreground">{form.hours}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">heures</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => patch("hours", form.hours + 1)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Batch count — booking only */}
                {form.type === "booking" && (
                  <div className="flex items-center justify-between">
                    <Label>Nombre de cachets (lot)</Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => patch("batchCount", Math.max(1, form.batchCount - 1))}
                        disabled={form.batchCount <= 1}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-lg font-semibold text-foreground">
                        {form.batchCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => patch("batchCount", form.batchCount + 1)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Territory — booking only */}
                {form.type === "booking" && (
                  <div className="space-y-1.5">
                    <Label>Territoire</Label>
                    <div className="flex gap-2">
                      {(["france", "étranger"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            patch("territory", t);
                            if (t === "étranger") patch("counts_for_intermittence", false);
                            else patch("counts_for_intermittence", true);
                          }}
                          className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                            form.territory === t
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          {t === "france" ? "France" : "Étranger"}
                        </button>
                      ))}
                    </div>
                    {form.territory === "étranger" && (
                      <p className="text-xs text-amber-400">
                        Les cachets à l'étranger ne comptent pas pour l'intermittence.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Compte pour l'intermittence</p>
                    <p className="text-xs text-muted-foreground">Décoche si hors régime</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.counts_for_intermittence}
                    onClick={() =>
                      patch("counts_for_intermittence", !form.counts_for_intermittence)
                    }
                    className={`relative h-6 w-11 rounded-full transition ${
                      form.counts_for_intermittence ? "bg-green-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        form.counts_for_intermittence
                          ? "left-[calc(100%-1.375rem)]"
                          : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rev-expenses">
                    Dépenses déductibles (€){" "}
                    <span className="font-normal text-muted-foreground">— optionnel</span>
                  </Label>
                  <Input
                    id="rev-expenses"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.deductible_expenses}
                    onChange={(e) => patch("deductible_expenses", e.target.value)}
                  />
                </div>
                <Button className="w-full rounded-full" size="lg" onClick={goNext}>
                  Suivant →
                </Button>
              </div>
            );
          })()}

          {/* ── Details: Non-intermittence (label, droits) ── */}
          {step === "details" && !INTERMITTENCE_TYPES.includes(form.type) && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rev-expenses-2">
                  Dépenses déductibles (€){" "}
                  <span className="font-normal text-muted-foreground">— optionnel</span>
                </Label>
                <Input
                  id="rev-expenses-2"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.deductible_expenses}
                  onChange={(e) => patch("deductible_expenses", e.target.value)}
                />
              </div>
              <Button className="w-full rounded-full" size="lg" onClick={goNext}>
                Suivant →
              </Button>
            </div>
          )}

          {/* ── Review ── */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2 text-sm">
                {(
                  [
                    [
                      "Type",
                      `${TYPE_OPTIONS.find((t) => t.value === form.type)?.emoji} ${
                        TYPE_OPTIONS.find((t) => t.value === form.type)?.label
                      }`,
                    ],
                    ["Intitulé", form.notes],
                    [
                      "Montant",
                      parseFloat(form.amount).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      }),
                    ],
                    form.payment_date
                      ? [
                          "Date",
                          new Date(form.payment_date).toLocaleDateString("fr-FR"),
                        ]
                      : null,
                    [
                      "Statut",
                      STATUS_OPTIONS.find((s) => s.value === form.status)?.label ?? form.status,
                    ],
                    INTERMITTENCE_TYPES.includes(form.type)
                      ? (() => {
                          const cc = Math.max(1, Math.round(form.hours / HOURS_PER_CACHET));
                          const batchSuffix = form.type === "booking" && form.batchCount > 1
                            ? ` × ${form.batchCount} lots`
                            : "";
                          return ["Durée", `${cc} cachet${cc > 1 ? "s" : ""} · ${form.hours} h${batchSuffix}`];
                        })()
                      : null,
                    parseFloat(form.deductible_expenses) > 0
                      ? [
                          "Dépenses",
                          `− ${parseFloat(form.deductible_expenses).toLocaleString("fr-FR", {
                            style: "currency",
                            currency: "EUR",
                          })}`,
                        ]
                      : null,
                  ] as ([string, string] | null)[]
                )
                  .filter((row): row is [string, string] => row !== null)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right text-foreground">{value}</span>
                    </div>
                  ))}
                {parseFloat(form.amount) > 0 && (
                  <div className="flex justify-between border-t border-border pt-2 mt-1">
                    <span className="text-muted-foreground">Commission (15%)</span>
                    <span className="text-muted-foreground">
                      {(
                        Math.max(
                          parseFloat(form.amount) -
                            (parseFloat(form.deductible_expenses) || 0),
                          0
                        ) * 0.15
                      ).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </span>
                  </div>
                )}
              </div>
              <Button
                className="w-full rounded-full"
                size="lg"
                disabled={busy}
                onClick={() => void submitForm()}
              >
                {busy ? "Enregistrement…" : "✓ Enregistrer"}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
