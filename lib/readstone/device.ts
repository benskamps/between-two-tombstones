// The device cookie: a random id plus an HMAC so a client can't mint ids that
// look like ours. It identifies a phone for rate limits only (decision 3).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DEVICE_COOKIE = "btt_dev";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

let processSecret: string | null = null;

/** DEVICE_COOKIE_SECRET, or a per-process random secret (with a warning) when it isn't set. */
export function deviceSecret(): string {
  const configured = process.env.DEVICE_COOKIE_SECRET?.trim();
  if (configured) return configured;
  if (!processSecret) {
    processSecret = randomBytes(32).toString("base64url");
    console.warn(
      "[read-stone] DEVICE_COOKIE_SECRET is not set; using a random per-process secret. " +
        "Device cookies will reset whenever this server restarts. Set it in production.",
    );
  }
  return processSecret;
}

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

/** The device id from a valid signed cookie, or null. */
export function readDeviceId(cookieHeader: string | null, secret: string): string | null {
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_COOKIE}=`));
  const value = pair?.slice(DEVICE_COOKIE.length + 1) ?? "";
  const match = value.match(/^([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  const expected = Buffer.from(sign(match[1], secret));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
}

/** A fresh device id and the Set-Cookie header value that carries it. */
export function newDeviceCookie(secret: string): { id: string; setCookie: string } {
  const id = randomBytes(18).toString("base64url");
  return {
    id,
    setCookie: `${DEVICE_COOKIE}=${id}.${sign(id, secret)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

/** The phone's id, issuing a new cookie when the request has no valid one. */
export function deviceFromRequest(request: Request): { id: string; setCookie?: string } {
  const secret = deviceSecret();
  const id = readDeviceId(request.headers.get("cookie"), secret);
  return id ? { id } : newDeviceCookie(secret);
}

/** First hop of x-forwarded-for, else x-real-ip, else "unknown". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || "";
  return /^[0-9A-Fa-f:.]{2,45}$/.test(candidate) ? candidate : "unknown";
}

/** Test hook: forget the per-process secret. */
export function resetDeviceSecretForTests(): void {
  processSecret = null;
}
