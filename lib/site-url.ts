export function getSiteUrl() {
  const configuredUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010").replace(/\/$/, "");

  // Keep every generated URL (email, canonical, OGP, and share links) on the
  // single public origin. This also protects authentication if a dashboard
  // variable is accidentally set to the legacy www host.
  try {
    const url = new URL(configuredUrl);
    if (url.hostname === "www.komacook.jp") url.hostname = "komacook.jp";
    return url.toString().replace(/\/$/, "");
  } catch {
    return configuredUrl;
  }
}

export function getAuthCallbackUrl(next = "/onboarding") {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}
