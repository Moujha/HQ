import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/subventions")({
  component: () => (
    <div className="px-5 pt-6">
      <h1 className="font-display text-2xl text-foreground capitalize">subventions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Module en cours de construction.</p>
    </div>
  ),
});
