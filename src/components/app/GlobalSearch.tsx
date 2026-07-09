import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Gavel, ListChecks, Radar, MessageSquare } from "lucide-react";

interface Result {
  id: string;
  label: string;
  type: "decision" | "task" | "veille" | "comment";
  to: string;
}

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const term = `%${q.trim()}%`;
    let active = true;
    (async () => {
      const [dec, tsk, vei, com] = await Promise.all([
        supabase.from("decisions").select("id,title").ilike("title", term).limit(6),
        supabase.from("tasks").select("id,title").ilike("title", term).limit(6),
        supabase.from("veille").select("id,title").ilike("title", term).limit(6),
        supabase.from("comments").select("id,content,entity_type").ilike("content", term).limit(6),
      ]);
      if (!active) return;
      const r: Result[] = [
        ...(dec.data ?? []).map((d: any) => ({
          id: d.id,
          label: d.title,
          type: "decision" as const,
          to: "/decisions",
        })),
        ...(tsk.data ?? []).map((d: any) => ({
          id: d.id,
          label: d.title,
          type: "task" as const,
          to: "/execution",
        })),
        ...(vei.data ?? []).map((d: any) => ({
          id: d.id,
          label: d.title,
          type: "veille" as const,
          to: "/veille",
        })),
        ...(com.data ?? []).map((d: any) => ({
          id: d.id,
          label: d.content,
          type: "comment" as const,
          to: "/archives",
        })),
      ];
      setResults(r);
    })();
    return () => {
      active = false;
    };
  }, [q]);

  const go = (to: string) => {
    onOpenChange(false);
    setQ("");
    navigate({ to });
  };

  const icon = (t: Result["type"]) =>
    t === "decision" ? Gavel : t === "task" ? ListChecks : t === "veille" ? Radar : MessageSquare;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Rechercher décisions, tâches, veille, commentaires…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>
          {q.trim().length < 2 ? "Tapez au moins 2 caractères." : "Aucun résultat."}
        </CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading="Résultats">
            {results.map((r) => {
              const Icon = icon(r.type);
              return (
                <CommandItem
                  key={`${r.type}-${r.id}`}
                  value={`${r.label} ${r.type}-${r.id}`}
                  onSelect={() => go(r.to)}
                >
                  <Icon className="mr-2 h-4 w-4 text-gold" />
                  <span className="truncate">{r.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
