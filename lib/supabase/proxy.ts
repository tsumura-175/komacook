import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "./config";

const protectedPrefixes = ["/mypage", "/settings", "/onboarding", "/admin", "/notifications"];

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;
  const unavailableAllowed = ["/account-unavailable", "/auth/signout", "/auth/callback", "/contact", "/terms", "/privacy", "/guidelines"].some((path) => pathname.startsWith(path));
  let profile: { account_status: string; onboarding_completed: boolean } | null = null;
  if (signedIn && !unavailableAllowed) {
    const result = await supabase.from("profiles").select("account_status, onboarding_completed").eq("user_id", String(data?.claims?.sub)).maybeSingle();
    profile = result.data;
    if (profile && profile.account_status !== "active") {
      const unavailableUrl = request.nextUrl.clone();
      unavailableUrl.pathname = "/account-unavailable";
      unavailableUrl.search = "";
      unavailableUrl.searchParams.set("status", profile.account_status);
      return NextResponse.redirect(unavailableUrl);
    }
    if (profile && !profile.onboarding_completed && !pathname.startsWith("/onboarding")) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      onboardingUrl.search = "";
      return NextResponse.redirect(onboardingUrl);
    }
  }
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix)) || request.nextUrl.pathname === "/recipes/new" || /\/recipes\/[^/]+\/edit$/.test(request.nextUrl.pathname);
  if (!signedIn && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (signedIn && request.nextUrl.pathname.startsWith("/admin")) {
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", String(data?.claims?.sub)).eq("role", "admin").maybeSingle();
    if (!role) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }
  return response;
}
