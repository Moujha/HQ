# Finance Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cachets / Fees / Factures tabs with a unified Finance tab — a revenue hub with summary cards linking to Cachets and Fees sub-pages, plus a smooth multi-step funnel for adding any revenue type.

**Architecture:** A new `src/routes/_authenticated/finance/` directory holds three independent TanStack Router routes (`index`, `cachets`, `fees`). A shared `AddRevenueSheet` component replaces `AddPaymentDrawer` with a step-by-step wizard (method → type → amount → details → review). The bottom nav is slimmed to Finance · Tâches · Agenda with Tracks/Subventions in "Plus".

**Tech Stack:** TanStack Router file-based routing, React, Supabase, Zod (inline validation, not via zodResolver), Tailwind, Lucide, Sonner toasts.

---

## File Map

| Action | Path |
|---|---|
| Modify | `src/components/app/AppHeader.tsx` |
| Create | `src/components/modules/finance/RevenueLine.tsx` |
| Create | `src/components/modules/finance/AddRevenueSheet.tsx` |
| Create | `src/routes/_authenticated/finance/index.tsx` |
| Create | `src/routes/_authenticated/finance/cachets.tsx` |
| Create | `src/routes/_authenticated/finance/fees.tsx` |
| Modify | `src/components/app/BottomNav.tsx` |
| Delete | `src/routes/_authenticated/cachets.tsx` |
| Delete | `src/routes/_authenticated/fees.tsx` |
| Delete | `src/routes/_authenticated/factures.tsx` |
| Delete | `src/components/modules/factures/FactureLine.tsx` |
| Delete | `src/components/modules/cachets/AddPaymentDrawer.tsx` |
| Modify | `src/components/modules/tracks/AddTrackDrawer.tsx` |

---

### Task 1: AppHeader — add optional `backTo` prop

**Files:**
- Modify: `src/components/app/AppHeader.tsx`

- [ ] **Step 1: Add `backTo` prop and render a back chevron**

Replace the `AppHeader` function signature and the title block. Add `Link` and `ChevronLeft` imports:

```tsx
import { Bell, LogOut, ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
// ... keep all existing imports

export function AppHeader({
  title,
  subtitle,
  backTo,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
}) {
```

Inside the header JSX, replace the `<div className="flex min-w-0 items-center gap-3">` block with:

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/AppHeader.tsx
git commit -m "feat: add backTo prop to AppHeader for sub-page navigation"
```

---

### Task 2: RevenueLine component

**Files:**
- Create: `src/components/modules/finance/RevenueLine.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/modules/finance/RevenueLine.tsx
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export interface RevenueLineData {
  id: string;
  notes: string | null;
  source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem";
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé";
}

const SOURCE_LABEL: Record<string, string> = {
  booking: "Cachet",
  sacem: "SACEM",
  label: "Label",
  clip: "Clip",
  résidence: "Résidence",
  figuration: "Figuration",
  track: "Track",
};

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-amber-400 bg-amber-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  provisoire: "Provisoire",
  facturé: "Facturé",
  cachet_en_attente: "En attente",
  payé: "Payé",
};

export function RevenueLine({
  revenue,
  onClick,
}: {
  revenue: RevenueLineData;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {revenue.notes ?? SOURCE_LABEL[revenue.source] ?? revenue.source}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {revenue.payment_date
              ? format(new Date(revenue.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
            {SOURCE_LABEL[revenue.source] ?? revenue.source}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold text-foreground">
          {revenue.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[revenue.status] ?? ""
          }`}
        >
          {STATUS_LABEL[revenue.status] ?? revenue.status}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/finance/RevenueLine.tsx
git commit -m "feat: add RevenueLine shared component for Finance revenue list"
```

---

### Task 3: AddRevenueSheet — multi-step add funnel

**Files:**
- Create: `src/components/modules/finance/AddRevenueSheet.tsx`

This replaces `AddPaymentDrawer`. It is a `Drawer` with 5 steps: `method → type → amount → details → review`. The `initialType` prop skips to `amount` (used by the Cachets sub-page FAB to pre-select "Cachet").

- [ ] **Step 1: Create the component**

```tsx
// src/components/modules/finance/AddRevenueSheet.tsx
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
type RevenueType = "booking" | "label" | "clip" | "résidence" | "figuration";
type StatusType = "provisoire" | "cachet_en_attente" | "payé";
type TerritoryType = "france" | "étranger";

const TYPE_OPTIONS: { value: RevenueType; label: string; emoji: string }[] = [
  { value: "booking", label: "Cachet", emoji: "🎵" },
  { value: "label", label: "Label", emoji: "🏷" },
  { value: "clip", label: "Clip", emoji: "🎬" },
  { value: "résidence", label: "Résidence", emoji: "🏠" },
  { value: "figuration", label: "Figuration", emoji: "👤" },
];

const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: "provisoire", label: "Provisoire" },
  { value: "cachet_en_attente", label: "En attente" },
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
  const { user } = useAuth();

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
      const { data: artistProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "artist")
        .limit(1)
        .single();
      if (profileErr) throw profileErr;

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
        artist_id: artistProfile.id,
        source: form.type,
        notes: form.notes,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date || null,
        status: form.status,
        territory: form.type === "booking" ? form.territory : ("france" as const),
        counts_for_intermittence:
          form.type === "booking" ? form.counts_for_intermittence : false,
        deductible_expenses: parseFloat(form.deductible_expenses) || 0,
        hours: form.type === "booking" ? form.hours : 12,
        batch_id,
        created_by: user?.id,
      });
      if (error) throw error;

      toast.success("Revenu ajouté");
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
    details: form.type === "booking" ? "Détails cachet" : "Détails",
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
                    if (opt.value !== "booking") {
                      patch("counts_for_intermittence", false);
                    } else {
                      patch("counts_for_intermittence", true);
                    }
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

          {/* ── Details: Cachet ── */}
          {step === "details" && form.type === "booking" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <Label>Heures par cachet</Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => patch("hours", Math.max(1, form.hours - 1))}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-lg font-semibold text-foreground">
                    {form.hours}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch("hours", Math.min(24, form.hours + 1))}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Nombre de cachets (lot)</Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => patch("batchCount", Math.max(1, form.batchCount - 1))}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
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
          )}

          {/* ── Details: Non-cachet ── */}
          {step === "details" && form.type !== "booking" && (
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
                    form.type === "booking"
                      ? [
                          "Heures",
                          `${form.hours} h${form.batchCount > 1 ? ` × ${form.batchCount} cachets` : ""}`,
                        ]
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
                  .filter(Boolean)
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/finance/AddRevenueSheet.tsx
git commit -m "feat: AddRevenueSheet multi-step funnel (method→type→amount→details→review)"
```

---

### Task 4: Finance main page — `/finance`

**Files:**
- Create: `src/routes/_authenticated/finance/index.tsx`

- [ ] **Step 1: Create the route file**

```tsx
// src/routes/_authenticated/finance/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { RevenueLine, type RevenueLineData } from "@/components/modules/finance/RevenueLine";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";
import { SacemImportDrawer } from "@/components/modules/tracks/SacemImportDrawer";
import { countValidCachets, countValidHours, type PaymentForCachets } from "@/lib/cachets";
import { computeResteDu, type ManagementFeeForCalc, type ExpenseForCalc } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinancePage,
});

type FinanceFilter =
  | "tous"
  | "cachets"
  | "sacem"
  | "label"
  | "clip"
  | "résidence"
  | "à_venir";

const FILTER_LABELS: Record<FinanceFilter, string> = {
  tous: "Tous",
  cachets: "Cachets",
  sacem: "SACEM",
  label: "Label",
  clip: "Clip",
  résidence: "Résidence",
  à_venir: "À venir",
};

type FullPayment = RevenueLineData & PaymentForCachets;

interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null } | null;
}

function FinancePage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filter, setFilter] = useState<FinanceFilter>("tous");
  const [addOpen, setAddOpen] = useState(false);
  const [sacemOpen, setSacemOpen] = useState(false);

  const { data: allPayments, refresh: refreshPayments } = useCollection<FullPayment>(
    "payments",
    {
      select: "*, batch:payment_batches(batch_count)",
      order: { column: "payment_date", ascending: false },
    }
  );

  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date)",
  });

  const { data: expenses } = useCollection<ExpenseForCalc>("expenses", {});

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const validCount = countValidCachets(cachets);
  const validHours = countValidHours(cachets);
  const resteDu = computeResteDu(filteredFees, expenses);

  const now = new Date();

  const filtered = useMemo(() => {
    switch (filter) {
      case "cachets":
        return allPayments.filter((p) => p.source === "booking");
      case "sacem":
        return allPayments.filter((p) => p.source === "sacem");
      case "label":
        return allPayments.filter((p) => p.source === "label");
      case "clip":
        return allPayments.filter((p) => p.source === "clip");
      case "résidence":
        return allPayments.filter((p) => p.source === "résidence");
      case "à_venir":
        return allPayments.filter(
          (p) =>
            (p.payment_date != null && new Date(p.payment_date) > now) ||
            p.status === "provisoire" ||
            p.status === "cachet_en_attente"
        );
      default:
        return allPayments;
    }
  }, [allPayments, filter, now]);

  return (
    <>
      <AppHeader title="Finance" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/finance/cachets"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Cachets
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {validCount}
            </p>
            <p className="text-xs text-muted-foreground">{validHours} h valides</p>
          </Link>
          <Link
            to="/finance/fees"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Fees manager
            </p>
            <p
              className={`mt-1 font-display text-2xl font-bold ${
                resteDu > 0 ? "text-amber-400" : "text-foreground"
              }`}
            >
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
            <p className="text-xs text-muted-foreground">reste dû</p>
          </Link>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {(Object.keys(FILTER_LABELS) as FinanceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Revenue list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun revenu{filter !== "tous" ? " dans cette catégorie" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <RevenueLine key={p.id} revenue={p} />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un revenu"
          className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSacemRequested={() => setSacemOpen(true)}
        onSuccess={refreshPayments}
      />
      <SacemImportDrawer
        open={sacemOpen}
        onOpenChange={setSacemOpen}
        onSuccess={refreshPayments}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/finance/index.tsx
git commit -m "feat: Finance main page with summary cards and revenue list"
```

---

### Task 5: Finance Cachets sub-page — `/finance/cachets`

**Files:**
- Create: `src/routes/_authenticated/finance/cachets.tsx`

This is the existing `cachets.tsx` logic moved to the new path, with `backTo="/finance"` on the header and `AddRevenueSheet` (pre-typed as "booking") replacing `AddPaymentDrawer`.

- [ ] **Step 1: Create the route file**

```tsx
// src/routes/_authenticated/finance/cachets.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { countValidCachets, expiringWithin } from "@/lib/cachets";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, type PaymentRow } from "@/components/modules/cachets/CachetRow";
import { EditPaymentDrawer } from "@/components/modules/cachets/EditPaymentDrawer";
import { IntermittenceGraph } from "@/components/modules/cachets/IntermittenceGraph";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";

export const Route = createFileRoute("/_authenticated/finance/cachets")({
  component: CachetsPage,
});

type Filter = "tous" | "actifs" | "provisoires" | "expirés";

const FILTER_LABELS: Record<Filter, string> = {
  tous: "Tous",
  actifs: "Actifs",
  provisoires: "Provisoires",
  expirés: "Expirés",
};

type FullPaymentRow = PaymentRow & {
  batch_id: string | null;
  batch: { batch_count: number } | null;
};

function CachetsPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filter, setFilter] = useState<Filter>("tous");
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<FullPaymentRow | null>(null);

  const { data: allPayments, refresh } = useCollection<FullPaymentRow>("payments", {
    select: "*, batch:payment_batches(batch_count)",
    order: { column: "payment_date", ascending: false },
  });

  const now = new Date();
  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "actifs":
        return cachets.filter(
          (p) =>
            p.status === "payé" && p.expires_at && new Date(p.expires_at) > now
        );
      case "provisoires":
        return cachets.filter(
          (p) => p.status === "provisoire" || p.status === "cachet_en_attente"
        );
      case "expirés":
        return cachets.filter(
          (p) =>
            p.status === "payé" && p.expires_at && new Date(p.expires_at) <= now
        );
      default:
        return cachets;
    }
  }, [cachets, filter, now]);

  const validCount = countValidCachets(cachets);
  const expiringSoon = expiringWithin(cachets, 60);

  return (
    <>
      <AppHeader title="Cachets" backTo="/finance" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        <IntermittenceGraph count={validCount} payments={cachets} />

        {expiringSoon.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <p className="text-xs text-amber-400">
              {expiringSoon.length === 1
                ? "1 cachet expire dans les 60 prochains jours"
                : `${expiringSoon.length} cachets expirent dans les 60 prochains jours`}
            </p>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun cachet{filter !== "tous" ? " dans cette catégorie" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <CachetRow key={p.id} payment={p} onClick={() => setEditPayment(p)} />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un cachet"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        initialType="booking"
        onSuccess={refresh}
      />

      <EditPaymentDrawer
        open={editPayment !== null}
        onOpenChange={(v) => {
          if (!v) setEditPayment(null);
        }}
        payment={editPayment}
        onSuccess={refresh}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/finance/cachets.tsx
git commit -m "feat: Finance/Cachets sub-page at /finance/cachets"
```

---

### Task 6: Finance Fees sub-page — `/finance/fees`

**Files:**
- Create: `src/routes/_authenticated/finance/fees.tsx`

This is the existing `fees.tsx` content moved to the new path, with `backTo="/finance"` on the header.

- [ ] **Step 1: Create the route file**

Copy the full content of the current `src/routes/_authenticated/fees.tsx`, change the route path to `"/_authenticated/finance/fees"`, and add `backTo="/finance"` to the `AppHeader` in `ManagerFeesView`:

```tsx
// src/routes/_authenticated/finance/fees.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { computeResteDu, computeControlRate } from "@/lib/fees";
import { AppHeader } from "@/components/app/AppHeader";
import { FeeLine, type FeeLineData } from "@/components/modules/fees/FeeLine";
import { VersementDrawer } from "@/components/modules/fees/VersementDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/finance/fees")({
  component: FeesPage,
});

interface ExpenseRow {
  id: string;
  amount: number;
  status: "à_rembourser" | "remboursée";
}

interface ArtistSummary {
  artist_id: string;
  total_due: number;
  total_paid: number;
  ndf_pending: number;
  reste_du: number;
}

function ManagerFeesView() {
  const { profile } = useAuth();
  const [versementOpen, setVersementOpen] = useState(false);

  const { data: fees, refresh: refreshFees } = useCollection<FeeLineData>("management_fees", {
    select: "*, payment:payments(notes, source, amount, payment_date, deductible_expenses)",
    order: { column: "created_at", ascending: false },
  });

  const { data: expenses, refresh: refreshExpenses } = useCollection<ExpenseRow>("expenses", {
    order: { column: "created_at", ascending: false },
  });

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const resteDu = computeResteDu(filteredFees, expenses);
  const totalEncaisse = filteredFees.reduce(
    (sum, f) => sum + (f.payment?.amount ?? 0),
    0
  );
  const controlRate = computeControlRate(filteredFees, totalEncaisse);

  const commissionDueTotal = filteredFees
    .filter((f) => f.status === "due")
    .reduce((sum, f) => sum + f.commission_due, 0);
  const ndfTotal = expenses
    .filter((e) => e.status === "à_rembourser")
    .reduce((sum, e) => sum + e.amount, 0);
  const alreadyPaid = filteredFees.reduce(
    (sum, f) => sum + f.already_paid_to_manager,
    0
  );

  return (
    <>
      <AppHeader title="Fees" subtitle={`depuis ${commissionStart}`} backTo="/finance" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Reste dû
            </p>
            <p className="mt-1 font-display text-5xl font-bold text-foreground">
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Commission due</p>
              <p className="mt-0.5 font-semibold text-amber-400">
                {commissionDueTotal.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">NDF</p>
              <p className="mt-0.5 font-semibold text-foreground">
                {ndfTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Déjà versé</p>
              <p className="mt-0.5 font-semibold text-green-400">
                {alreadyPaid.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Taux de contrôle · total encaissé{" "}
              {totalEncaisse.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
            <span className="font-semibold text-foreground">
              {(controlRate * 100).toFixed(1)} %
            </span>
          </div>
          <button
            onClick={() => setVersementOpen(true)}
            className="w-full rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Enregistrer un versement
          </button>
        </div>

        <div className="space-y-2">
          {filteredFees.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune ligne de commission.
            </p>
          )}
          {filteredFees.map((f) => (
            <FeeLine key={f.id} fee={f} />
          ))}
        </div>
      </div>

      <VersementDrawer
        open={versementOpen}
        onOpenChange={setVersementOpen}
        totalDue={resteDu}
        onSuccess={() => {
          refreshFees();
          refreshExpenses();
        }}
      />
    </>
  );
}

function ArtistFeesView() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<ArtistSummary | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("artist_fee_summary")
      .select("*")
      .eq("artist_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setSummary(data));
  }, [profile]);

  return (
    <>
      <AppHeader title="Fees" backTo="/finance" />
      <div className="px-4 pt-4 pb-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">Montant dû à ton manager</p>
          <p className="mt-3 font-display text-5xl font-bold text-foreground">
            {summary
              ? summary.reste_du.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })
              : "—"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Mis à jour en temps réel</p>
        </div>
      </div>
    </>
  );
}

function FeesPage() {
  const { profile } = useAuth();
  if (profile?.role === "artist") return <ArtistFeesView />;
  return <ManagerFeesView />;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/finance/fees.tsx
git commit -m "feat: Finance/Fees sub-page at /finance/fees"
```

---

### Task 7: Update BottomNav

**Files:**
- Modify: `src/components/app/BottomNav.tsx`

Replace the manager's 4-tab primary nav (Cachets · Fees · Factures · Tâches) with 3 tabs (Finance · Tâches · Agenda). Update the artist nav to point to `/finance/cachets`. Remove Agenda, Tracks, Subventions shuffle — Tracks/Subventions stay in More, Agenda moves to primary.

- [ ] **Step 1: Rewrite BottomNav**

```tsx
// src/components/app/BottomNav.tsx
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Music2,
  Wallet,
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

const FINANCE = { to: "/finance", label: "Finance", icon: Wallet } as const;
const CACHETS = { to: "/finance/cachets", label: "Cachets", icon: Music2 } as const;
const TACHES = { to: "/taches", label: "Tâches", icon: CheckSquare } as const;
const CALENDRIER = { to: "/calendrier", label: "Agenda", icon: Calendar } as const;

const MANAGER_PRIMARY = [FINANCE, TACHES, CALENDRIER] as const;
const ARTIST_PRIMARY = [CACHETS, TACHES, CALENDRIER] as const;

const MANAGER_MORE = [
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
          const active =
            t.to === "/finance"
              ? pathname.startsWith("/finance")
              : pathname.startsWith(t.to);
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
            <SheetContent
              side="bottom"
              className="rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
            >
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/BottomNav.tsx
git commit -m "feat: BottomNav — Finance replaces Cachets/Fees/Factures tabs"
```

---

### Task 8: Delete old routes and components

**Files:**
- Delete: `src/routes/_authenticated/cachets.tsx`
- Delete: `src/routes/_authenticated/fees.tsx`
- Delete: `src/routes/_authenticated/factures.tsx`
- Delete: `src/components/modules/factures/FactureLine.tsx`
- Delete: `src/components/modules/cachets/AddPaymentDrawer.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm src/routes/_authenticated/cachets.tsx
rm src/routes/_authenticated/fees.tsx
rm src/routes/_authenticated/factures.tsx
rm src/components/modules/factures/FactureLine.tsx
rmdir src/components/modules/factures
rm src/components/modules/cachets/AddPaymentDrawer.tsx
```

- [ ] **Step 2: Type-check — verify no dangling imports**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import errors pointing to the deleted files, search for remaining references:

```bash
grep -r "AddPaymentDrawer\|FactureLine\|/cachets\b\|/fees\b\|/factures" src/ --include="*.tsx" --include="*.ts"
```

Fix any remaining import by updating to the new path or removing the import.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove cachets/fees/factures routes and AddPaymentDrawer (replaced by Finance)"
```

---

### Task 9: AddTrackDrawer — auto-set `is_commissionable` from `commission_start_date`

**Files:**
- Modify: `src/components/modules/tracks/AddTrackDrawer.tsx`

When the manager enters a `release_date`, auto-set `is_commissionable` to `true` if `release_date >= profile.commission_start_date`. The toggle remains editable.

- [ ] **Step 1: Add `useAuth` and the auto-set effect**

Add `useEffect` to existing imports and add `useAuth`:

```tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
```

Inside `AddTrackDrawer`, before the `submit` function, add:

```tsx
const { profile } = useAuth();
const releaseDate = watch("release_date");

useEffect(() => {
  if (!releaseDate || !profile?.commission_start_date) return;
  setValue("is_commissionable", releaseDate >= profile.commission_start_date);
}, [releaseDate, profile?.commission_start_date, setValue]);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: all 25 tests pass (no test touches AddTrackDrawer so all should be green).

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/tracks/AddTrackDrawer.tsx
git commit -m "feat: auto-set track is_commissionable based on release_date vs commission_start_date"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Finance tab replaces Cachets/Fees/Factures | Task 7 (BottomNav), Task 8 (delete old routes) |
| Finance page with summary cards → sub-pages | Task 4 |
| Filter chips on Finance page | Task 4 |
| Cachets sub-page at /finance/cachets | Task 5 |
| Fees sub-page at /finance/fees | Task 6 |
| AppHeader back button for sub-pages | Task 1 |
| Multi-step add funnel (method → type → amount → details → review) | Task 3 |
| Manual entry: Cachet steps (heures, batch, territoire, intermittence) | Task 3 |
| Manual entry: Non-cachet steps (dépenses only) | Task 3 |
| SACEM method → closes sheet, opens SacemImportDrawer | Task 3 + Task 4 |
| Bank/Screenshot disabled placeholders with "Bientôt" badge | Task 3 |
| Artist nav points to /finance/cachets | Task 7 |
| Factures becomes a status (no dedicated page) | Task 8 |
| Track is_commissionable auto-set from commission_start_date | Task 9 |
| RevenueLine shared component | Task 2 |

**No placeholders found.**

**Type consistency:** `RevenueLineData` defined in Task 2, used in Task 4. `PaymentForCachets` from `@/lib/cachets` — `FullPayment` extends both in Task 4. `ManagementFeeForCalc`/`ExpenseForCalc` from `@/lib/fees`. All consistent.
