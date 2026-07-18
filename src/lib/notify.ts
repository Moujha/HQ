import { supabase } from "@/integrations/supabase/client";
import { dispatchPush } from "@/lib/push.functions";

export type Role = "manager" | "artist";

export interface NotifyParams {
  recipientRole: Role;
  title: string;
  body?: string;
  url?: string;
}

/**
 * Notify a role of an event: writes an in-app notification row (feeds the
 * bell icon in AppHeader) and sends a push to every device registered for
 * that role. Best-effort — a failure here must never block the caller's
 * already-successful business write.
 */
export async function notifyRole({
  recipientRole,
  title,
  body,
  url,
}: NotifyParams): Promise<void> {
  const { error: dbError } = await supabase.from("notifications").insert({
    recipient_role: recipientRole,
    title,
    body: body ?? null,
  });
  if (dbError) {
    console.error("notifyRole: failed to insert in-app notification", dbError);
  }

  try {
    await dispatchPush({ data: { recipientRole, title, body, url } });
  } catch (err) {
    console.error("notifyRole: failed to dispatch push", err);
  }
}

/**
 * Determine who should be notified about a task event, given who performed
 * it and who the task is assigned to. Returns null if the task doesn't
 * involve the role that isn't the actor (e.g. a manager-only task doesn't
 * notify the artist).
 */
export function shouldNotifyRole(
  actorRole: Role,
  assigneeRole: "manager" | "artist" | "both"
): Role | null {
  const otherRole: Role = actorRole === "manager" ? "artist" : "manager";
  if (assigneeRole === "both" || assigneeRole === otherRole) {
    return otherRole;
  }
  return null;
}
