// Pure Web Crypto implementation of VAPID + RFC 8291 (aes128gcm) web push.
// Works on the Cloudflare Workers runtime (globalThis.crypto.subtle).
// Server-only: never import from client code.

const subtle = globalThis.crypto.subtle;

// TS's DOM/Worker lib types crypto args as ArrayBuffer-backed views; our
// Uint8Arrays are ArrayBufferLike-backed. They are byte-compatible at runtime.
const bs = (a: Uint8Array): BufferSource => a as unknown as BufferSource;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", bs(ikm), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: bs(salt), info: bs(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function buildVapidHeader(endpoint: string): Promise<string> {
  const jwkRaw = process.env.VAPID_PRIVATE_JWK;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!jwkRaw || !publicKey) {
    throw new Error("VAPID keys are not configured");
  }
  const jwk = JSON.parse(jwkRaw);
  const privateKey = await subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const sig = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    bs(utf8(signingInput)),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

async function encryptPayload(
  sub: PushSubscriptionRecord,
  payload: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(sub.auth); // 16 bytes

  const uaKey = await subtle.importKey(
    "raw",
    bs(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const local = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const localPublic = new Uint8Array(
    await subtle.exportKey("raw", local.publicKey),
  );

  const sharedBits = await subtle.deriveBits(
    { name: "ECDH", public: uaKey },
    local.privateKey,
    256,
  );
  const shared = new Uint8Array(sharedBits);

  // Combine step (RFC 8291)
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, localPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await subtle.importKey("raw", bs(cek), { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  // Single record: plaintext + 0x02 delimiter (last record, no padding)
  const record = concat(utf8(payload), new Uint8Array([2]));
  const encrypted = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: bs(nonce) }, aesKey, bs(record)),
  );

  // aes128gcm header: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const idlen = new Uint8Array([localPublic.length]);
  return concat(salt, rs, idlen, localPublic, encrypted);
}

export interface WebPushResult {
  ok: boolean;
  status: number;
  gone: boolean; // 404/410 -> subscription should be removed
}

export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: string,
): Promise<WebPushResult> {
  const body = await encryptPayload(sub, payload);
  const authorization = await buildVapidHeader(sub.endpoint);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: authorization,
    },
    body: body as unknown as BodyInit,
  });

  return {
    ok: res.ok,
    status: res.status,
    gone: res.status === 404 || res.status === 410,
  };
}
