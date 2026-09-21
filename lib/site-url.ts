export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010").replace(/\/$/, "");
}

export function getAuthCallbackUrl(next = "/onboarding") {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

