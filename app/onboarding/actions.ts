"use server";

import { z } from "zod";
import { normalizeAvatarImage } from "../../lib/avatar-image";
import { getAuthCallbackUrl } from "../../lib/site-url";
import { createClient } from "../../lib/supabase/server";

const schema = z.object({
  displayName: z.string().trim().min(1).max(30),
  servings: z.coerce.number().int().min(1).max(20),
  adults: z.union([z.literal(""), z.coerce.number().int().min(0).max(20)]),
  children: z.union([z.literal(""), z.coerce.number().int().min(0).max(20)]),
  familyPublic: z.enum(["private", "public"]),
  avatarMode: z.enum(["preset", "upload"]),
  presetAvatarKey: z.enum(["utensils", "carrot", "apple", "bread", "mug", "bowl", "cheese", "cookie"]),
  avatarColor: z.enum(["coral", "leaf", "mustard", "brown", "rose", "blue"]),
  contactEmail: z.union([z.literal(""), z.string().trim().email()]),
});

export type OnboardingResult = { ok: true; confirmationRequired: boolean } | { ok: false; error: string };

export async function completeOnboarding(formData: FormData): Promise<OnboardingResult> {
  const parsed = schema.safeParse({
    displayName: formData.get("display_name"),
    servings: formData.get("servings"),
    adults: formData.get("adults"),
    children: formData.get("children"),
    familyPublic: formData.get("family_public"),
    avatarMode: formData.get("avatar_mode"),
    presetAvatarKey: formData.get("preset_avatar_key"),
    avatarColor: formData.get("avatar_color"),
    contactEmail: formData.get("contact_email"),
  });
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください。" };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: currentProfile } = await supabase.from("profiles")
    .select("account_status, avatar_path")
    .eq("user_id", user.id)
    .single();
  if (!currentProfile || currentProfile.account_status !== "active") {
    return { ok: false, error: "このアカウントでは初回設定を変更できません。" };
  }

  const value = parsed.data;
  const hasConfirmedEmail = Boolean(user.email && user.email_confirmed_at);
  if (!hasConfirmedEmail && !value.contactEmail) {
    return { ok: false, error: "連絡用メールアドレスを入力してください。" };
  }

  let avatarPath = value.avatarMode === "upload" ? currentProfile.avatar_path : null;
  let uploadedPath: string | null = null;
  const avatar = formData.get("avatar");
  if (value.avatarMode === "upload" && avatar instanceof File && avatar.size > 0) {
    let normalizedAvatar: Buffer;
    try {
      normalizedAvatar = await normalizeAvatarImage(avatar);
    } catch {
      return { ok: false, error: "画像はJPEG・PNG・WebP形式、5MB以下で選択してください。" };
    }
    uploadedPath = `${user.id}/avatar-${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from("avatars")
      .upload(uploadedPath, normalizedAvatar, { contentType: "image/webp", upsert: false });
    if (uploadError) return { ok: false, error: "プロフィール画像を保存できませんでした。" };
    avatarPath = uploadedPath;
  }
  if (value.avatarMode === "upload" && !avatarPath) {
    return { ok: false, error: "プロフィール画像を選択してください。" };
  }

  if (!hasConfirmedEmail) {
    const { error: emailError } = await supabase.auth.updateUser(
      { email: value.contactEmail },
      { emailRedirectTo: getAuthCallbackUrl("/onboarding") },
    );
    if (emailError) {
      if (uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
      return { ok: false, error: "確認メールを送信できませんでした。別のメールアドレスを確認してください。" };
    }
  }

  const { data: onboardingCompleted, error } = await supabase.rpc("complete_onboarding", {
    p_display_name: value.displayName,
    p_standard_servings: value.servings,
    p_family_adults: value.adults === "" ? null : value.adults,
    p_family_children: value.children === "" ? null : value.children,
    p_show_family: value.familyPublic === "public",
    p_avatar_kind: value.avatarMode,
    p_preset_avatar_key: value.presetAvatarKey,
    p_avatar_color: value.avatarColor,
    p_avatar_path: avatarPath,
  });
  if (error) {
    if (uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
    return { ok: false, error: "初回設定を保存できませんでした。" };
  }

  if (currentProfile.avatar_path && currentProfile.avatar_path !== avatarPath) {
    await supabase.storage.from("avatars").remove([currentProfile.avatar_path]);
  }
  return { ok: true, confirmationRequired: !onboardingCompleted };
}
