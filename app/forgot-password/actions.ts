"use server";

import { z } from "zod";
import { getSiteUrl } from "../../lib/site-url";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

export type ForgotState = { error?: string; success?: string };

export async function sendPasswordResetEmail(_: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.string().trim().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "メールアドレスの形式を確認してください。" };
  if (!hasSupabaseConfig()) return { error: "Supabaseの接続設定後に再設定メールを送信できます。" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}` });
  return error ? { error: "送信できませんでした。少し時間をおいてお試しください。" } : { success: "登録されている場合、パスワード再設定メールが届きます。" };
}

