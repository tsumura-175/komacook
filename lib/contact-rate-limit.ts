import { createHmac } from "node:crypto";

export function contactRateLimitIdentifier(value: string, secret: string) {
  if (!secret) throw new Error("CONTACT_RATE_LIMIT_SECRET is not configured.");
  return createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
}

export function contactRequestIdentity(userId: string | undefined, forwardedFor: string | null, realIp: string | null) {
  if (userId) return `user:${userId}`;
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
  return `guest:${ip}`;
}

