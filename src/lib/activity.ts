import { supabase } from "@/integrations/supabase/client";
import { dispatchPush } from "@/lib/push.functions";

// Tells every active useCollection() to refetch immediately, so a user's own
// action is reflected on screen even if the realtime channel is slow/offline.
export function refreshCollections() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mc-refresh"));
  }
}


function linkToUrl(linkType?: string | null): string {
  switch (linkType) {
    case "decision":
      return "/decisions";
    case "task":
      return "/execution";
    case "veille":
      return "/veille";
    default:
      return "/cockpit";
  }
}

// Records an entry in the shared activity journal.
export async function logActivity(params: {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  title: string;
  detail?: string | null;
  user_id?: string | null;
  user_name?: string | null;
}) {
  await supabase.from("activity_log").insert({
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    action: params.action,
    title: params.title,
    detail: params.detail ?? null,
    user_id: params.user_id ?? null,
    user_name: params.user_name ?? null,
  });
  refreshCollections();
}

// Creates an internal notification targeting a role ("manager" | "artist")
// and delivers a push notification to that role's registered devices.
export async function notify(params: {
  recipient_role: string;
  title: string;
  body?: string | null;
  link_type?: string | null;
  link_id?: string | null;
  created_by?: string | null;
}) {
  await supabase.from("notifications").insert({
    recipient_role: params.recipient_role,
    title: params.title,
    body: params.body ?? null,
    link_type: params.link_type ?? null,
    link_id: params.link_id ?? null,
    created_by: params.created_by ?? null,
  });
  refreshCollections();



  if (params.recipient_role === "manager" || params.recipient_role === "artist") {
    try {
      await dispatchPush({
        data: {
          recipientRole: params.recipient_role,
          title: params.title,
          body: params.body ?? undefined,
          url: linkToUrl(params.link_type),
        },
      });
    } catch {
      // push delivery is best-effort; never block the app flow
    }
  }
}

// Backwards-compatible alias.
export const createNotification = notify;
