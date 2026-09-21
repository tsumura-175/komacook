"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthCallbackUrl } from "../../lib/site-url";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateNewPassword } from "../../lib/password-policy";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

export type AuthState = { error?: string; success?: string; confirmationRequired?: boolean; requestId?: string };
const unavailable = "認証サーバーの接続設定が未完了です。Supabaseの環境変数を設定すると利用できます。";
const loginSchema = z.object({ email: z.string().trim().email("メールアドレスの形式を確認してください。"), password: z.string().min(8) });
const signupSchema = z.object({ email: z.string().trim().email("メールアドレスの形式を確認してください。"), password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH) });

async function safeNext(value: FormDataEntryValue | null, fallback = "/") {
  const referer = (await headers()).get("referer");
  const refererNext = referer ? new URL(referer).searchParams.get("next") : null;
  const next = typeof value === "string" ? value : refererNext ?? fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signInWithGoogle(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: getAuthCallbackUrl(await safeNext(formData.get("next"))), queryParams: { prompt: "select_account" } } });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signInWithPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "メールアドレスとパスワードを確認してください。" };
  if (!hasSupabaseConfig()) return { error: unavailable };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error?.code === "email_not_confirmed") return { confirmationRequired: true, requestId: crypto.randomUUID() };
  if (error) return { error: "メールアドレスまたはパスワードが正しくありません。" };
  const { data: profile } = await supabase.from("profiles").select("account_status, onboarding_completed").eq("user_id", data.user.id).maybeSingle();
  if (profile && profile.account_status !== "active") {
    await supabase.auth.signOut();
    return { error: profile.account_status === "suspended" ? "このアカウントは現在利用停止中です。お問い合わせから運営へご連絡ください。" : "このアカウントは退会処理中です。" };
  }
  if (!profile?.onboarding_completed) redirect("/onboarding");
  redirect(await safeNext(formData.get("next")));
}

export async function signUpWithPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: `${PASSWORD_MIN_LENGTH}文字以上のパスワードを入力してください。` };
  if (parsed.data.password !== formData.get("password_confirmation")) return { error: "確認用パスワードが一致していません。" };
  const passwordError = await validateNewPassword(parsed.data.password, [parsed.data.email]);
  if (passwordError) return { error: passwordError };
  if (!hasSupabaseConfig()) return { error: unavailable };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: getAuthCallbackUrl() } });
  if (error) return { error: error.message.includes("already registered") ? "このメールアドレスは登録済みです。" : "会員登録に失敗しました。" };
  if (!data.session) return { confirmationRequired: true, requestId: crypto.randomUUID() };
  redirect("/onboarding");
}

export async function resendSignupConfirmation(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.string().trim().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "メールアドレスの形式を確認してください。" };
  if (!hasSupabaseConfig()) return { error: unavailable };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: getAuthCallbackUrl() } });
  return error ? { error: "再送できませんでした。少し時間をおいてお試しください。" } : { success: "再送可能な場合は確認メールを送信しました。" };
}
