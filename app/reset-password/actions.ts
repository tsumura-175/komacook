"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateNewPassword } from "../../lib/password-policy";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";

export type ResetState = { error?: string };

export async function updatePassword(_: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).safeParse(formData.get("password"));
  if (!parsed.success) return { error: `${PASSWORD_MIN_LENGTH}文字以上で入力してください。` };
  if (parsed.data !== formData.get("password_confirmation")) return { error: "確認用パスワードが一致していません。" };
  const passwordError = await validateNewPassword(parsed.data);
  if (passwordError) return { error: passwordError };
  if (!hasSupabaseConfig()) return { error: "Supabaseの接続設定後に変更できます。" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "再設定リンクの有効期限が切れています。" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "パスワードを更新できませんでした。" };
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?message=password-updated");
}

