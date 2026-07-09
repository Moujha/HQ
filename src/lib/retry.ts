import type { PostgrestError } from "@supabase/supabase-js";

export type SupabaseResult<T> = {
  data: T | null;
  error: PostgrestError | null;
};

// Turns a raw Supabase/Postgres error into a clear, human-readable message.
export function describeSupabaseError(error: PostgrestError | null): string {
  if (!error) return "Erreur inconnue.";

  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  // Network / connectivity
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    code === ""
  ) {
    return "Connexion au serveur impossible. Vérifie ta connexion internet.";
  }

  switch (code) {
    case "23505":
      return "Cet élément existe déjà (doublon détecté).";
    case "23502":
      return "Un champ obligatoire est manquant.";
    case "23503":
      return "Référence invalide : un élément lié est introuvable.";
    case "23514":
      return "Une valeur saisie n'est pas autorisée.";
    case "42501":
    case "PGRST301":
      return "Tu n'as pas les droits nécessaires pour cette action.";
    case "PGRST116":
      return "Aucun enregistrement correspondant trouvé.";
    default:
      return error.message
        ? `Échec de l'enregistrement : ${error.message}`
        : "Échec de l'enregistrement. Réessaie.";
  }
}

// Errors that are worth retrying automatically (transient / network / timeout).
function isRetryable(error: PostgrestError | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "") return true; // typically a fetch/network failure
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504")
  ) {
    return true;
  }
  // Postgres: too many connections / cannot connect / server closed
  return ["08000", "08003", "08006", "53300", "57P03", "XX000"].includes(code);
}

// Runs a Supabase query builder, retrying transient failures with backoff.
// Returns the final result (data + error) so callers can surface a message.
export async function withRetry<T>(
  run: () => PromiseLike<SupabaseResult<T>>,
  options: {
    retries?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, error: PostgrestError) => void;
  } = {},
): Promise<SupabaseResult<T>> {
  const retries = options.retries ?? 3;
  const baseDelay = options.baseDelayMs ?? 600;

  let result: SupabaseResult<T> = { data: null, error: null };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      result = await run();
    } catch (e: any) {
      // Thrown errors (e.g. network) get normalized into a PostgrestError shape.
      result = {
        data: null,
        error: {
          message: e?.message ?? String(e),
          details: "",
          hint: "",
          code: "",
          name: "PostgrestError",
        } as PostgrestError,
      };
    }

    if (!result.error) return result;
    if (attempt >= retries || !isRetryable(result.error)) return result;

    options.onRetry?.(attempt, result.error);
    await new Promise((r) => setTimeout(r, baseDelay * attempt));
  }

  return result;
}
