import { NextResponse } from "next/server";
import { getSiteUrl } from "../../../lib/site-url";
import { hasSupabaseConfig } from "../../../lib/supabase/config";
import { createClient } from "../../../lib/supabase/server";
import { ensureD1Profile } from "../../../lib/d1-profiles";
import { usesD1AppData } from "../../../lib/d1-bindings";

function callbackFailurePath(next: string, errorCode?: string) {
  if (next.startsWith("/settings/connections")) return "/settings/connections?error=google-link";
  if (["bad_code_verifier", "flow_state_not_found"].includes(errorCode ?? "")) return "/login?error=callback-verifier";
  if (["flow_state_expired", "otp_expired", "validation_failed"].includes(errorCode ?? "")) return "/login?error=callback-expired";
  return "/login?error=callback";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const flowId = params.get("sb_flow_id");
  const requestedNext = params.get("next") ?? "/onboarding";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/onboarding";

  if (code && hasSupabaseConfig()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      const { data: authData } = await supabase.auth.getUser();
      const d1Profile = authData.user && usesD1AppData()
        ? await ensureD1Profile(authData.user.id, String(authData.user.user_metadata.full_name ?? authData.user.user_metadata.name ?? "").trim() || "こまクックユーザー")
        : null;
      const { data: legacyProfile } = authData.user && !usesD1AppData()
        ? await supabase.from("profiles").select("account_status, onboarding_completed").eq("user_id", authData.user.id).maybeSingle()
        : { data: null };
      const profile = d1Profile ?? legacyProfile;
      if (profile && profile.account_status !== "active") return NextResponse.redirect(`${getSiteUrl()}/account-unavailable?status=${profile.account_status}`);
      if (!profile?.onboarding_completed) {
        if (usesD1AppData() && authData.user) {
          // Google初回ログインとメール確認後を区別するため、D1では初回設定画面で
          // 完了状態を確定する。旧SupabaseのRPCは呼び出さない。
          return NextResponse.redirect(`${getSiteUrl()}/onboarding`);
        }
        const { data: finalized } = await supabase.rpc("finalize_onboarding_after_email_confirmation");
        if (!finalized) return NextResponse.redirect(`${getSiteUrl()}/onboarding`);
      }
      return NextResponse.redirect(`${getSiteUrl()}${next}`);
    }

    // Never log the one-time code or user email. Error metadata is enough to
    // distinguish an expired link, a missing verifier, and a configuration error.
    console.error("Supabase auth callback failed", { code: error.code, name: error.name, status: error.status });
    return NextResponse.redirect(`${getSiteUrl()}${callbackFailurePath(next, error.code)}`);
  }

  console.error("Supabase auth callback missing code or configuration", { hasCode: Boolean(code), hasSupabaseConfig: hasSupabaseConfig() });
  return NextResponse.redirect(`${getSiteUrl()}${callbackFailurePath(next)}`);
}
