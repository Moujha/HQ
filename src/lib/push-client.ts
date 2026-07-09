// Client helpers for enabling/disabling iOS + web push notifications.
import { savePushSubscription, deletePushSubscription } from "@/lib/push.functions";

// Public VAPID key (safe to ship to the browser).
const VAPID_PUBLIC_KEY =
  "BKaNYBhLpcsgBk57Ibim6koyC9th3qpDlsooUPzSCyej1GHbJnxeC8jGvs1jM_8V4oo4icdqk2--rO_WLcapcMQ";

const PUSH_SW_URL = "/push-sw.js";
const PUSH_SW_SCOPE = "/push-notifications";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// On iOS, web push only works once the app is installed to the home screen.
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE });
}

// Waits until the given registration has an ACTIVE worker. We cannot use
// `navigator.serviceWorker.ready` here because that only resolves for a worker
// controlling the current page scope — our push worker uses a custom scope
// (`/push-notifications`), so `ready` would hang forever on iOS. We watch the
// specific registration instead, with a timeout so the UI never spins forever.
async function waitForActive(
  reg: ServiceWorkerRegistration,
  timeoutMs = 10000,
): Promise<void> {
  if (reg.active) return;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);

    const installing = reg.installing || reg.waiting;
    if (installing) {
      installing.addEventListener("statechange", () => {
        if (installing.state === "activated" || reg.active) finish();
      });
    }
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "activated" || reg.active) finish();
      });
    });

    // Safety poll in case the events above are missed.
    const poll = setInterval(() => {
      if (reg.active) {
        clearInterval(poll);
        finish();
      }
    }, 250);
  });
}


export async function isPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    return !!sub && getPermission() === "granted";
  } catch {
    return false;
  }
}

// Overall status the UI can display without ambiguity.
export type PushStatus =
  | "granted" // abonnement actif
  | "denied" // refusé dans les réglages
  | "default" // en attente d'autorisation
  | "unsupported" // appareil non compatible
  | "ios-not-installed"; // iOS mais pas ajouté à l'écran d'accueil

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (isIosSafari() && !isStandalone()) return "ios-not-installed";
  const perm = getPermission();
  if (perm === "denied") return "denied";
  if (perm === "granted") {
    return (await isPushEnabled()) ? "granted" : "default";
  }
  return "default";
}

// Rejects if a promise takes longer than `ms`, so the UI never spins forever.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms),
    ),
  ]);
}

export async function enablePush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (isIosSafari() && !isStandalone()) {
    return { ok: false, reason: "ios-not-installed" };
  }

  try {
    const permission = await withTimeout(
      Promise.resolve(Notification.requestPermission()),
      30000,
      "permission",
    );
    if (permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    const reg = await withTimeout(getRegistration(), 15000, "register");
    await waitForActive(reg);

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY,
          ) as unknown as BufferSource,
        }),
        20000,
        "subscribe",
      );
    }

    await withTimeout(
      savePushSubscription({
        data: {
          endpoint: sub.endpoint,
          p256dh: bufToB64url(sub.getKey("p256dh")),
          auth: bufToB64url(sub.getKey("auth")),
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        },
      }),
      15000,
      "save",
    );

    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.startsWith("timeout:")) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "error" };
  }
}


export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await deletePushSubscription({ data: { endpoint } }).catch(() => undefined);
  }
}
