import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => subscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ endpoint: z.string().url() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const dispatchSchema = z.object({
  recipientRole: z.enum(["manager", "artist"]),
  title: z.string().min(1).max(120),
  body: z.string().max(300).optional(),
  url: z.string().max(300).optional(),
});

// Sends a push to every device of every user holding the target role.
// Authenticated so it is not a public endpoint; any signed-in member can
// trigger a notification for the other role as part of normal app events.
export const dispatchPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => dispatchSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { sendWebPush } = await import("@/lib/webpush.server");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("role", data.recipientRole);

    const userIds = (profiles ?? []).map((p) => p.user_id);
    if (userIds.length === 0) return { sent: 0 };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", userIds);

    if (!subs || subs.length === 0) return { sent: 0 };

    const payload = JSON.stringify({
      title: data.title,
      body: data.body ?? "",
      url: data.url ?? "/cockpit",
    });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          const res = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload,
          );
          if (res.ok) sent++;
          else if (res.gone) stale.push(s.id);
        } catch {
          // ignore individual send failures
        }
      }),
    );

    if (stale.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    }

    return { sent };
  });
