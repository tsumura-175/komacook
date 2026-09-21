import { NextResponse } from "next/server";
import { getSiteUrl } from "../../../lib/site-url";
import { hasSupabaseConfig } from "../../../lib/supabase/config";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const requestedNext = params.get("next") ?? "/onboarding";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/onboarding";
  const failurePath = next.startsWith("/settings/connections") ? "/settings/connections?error=google-link" : "/login?error=callback";
  if (code && hasSupabaseConfig()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: authData } = await supabase.auth.getUser();
      const { data: profile } = authData.user ? await supabase.from("profiles").select("account_status, onboarding_completed").eq("user_id", authData.user.id).maybeSingle() : { data: null };
      if (profile && profile.account_status !== "active") return NextResponse.redirect(`${getSiteUrl()}/account-unavailable?status=${profile.account_status}`);
      if (!profile?.onboarding_completed) {
        const { data: finalized } = await supabase.rpc("finalize_onboarding_after_email_confirmation");
        if (!finalized) return NextResponse.redirect(`${getSiteUrl()}/onboarding`);
      }
      return NextResponse.redirect(`${getSiteUrl()}${next}`);
    }
  }
  return NextResponse.redirect(`${getSiteUrl()}${failurePath}`);
}
