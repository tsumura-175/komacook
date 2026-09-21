"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAvatarImage } from "../../lib/avatar-image";
import { familySettingsSchema, GOOGLE_UNLINK_CONFIRMATION, SIGN_OUT_CONFIRMATION, valuesMatch } from "../../lib/account-settings";
import { validateNewPassword } from "../../lib/password-policy";
import { getAuthCallbackUrl } from "../../lib/site-url";
import { createClient } from "../../lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(30), servings: z.coerce.number().int().min(1).max(20),
    avatarMode: z.enum(["preset", "upload"]),
    presetAvatarKey: z.enum(["utensils", "carrot", "apple", "bread", "mug", "bowl", "cheese", "cookie"]),
    avatarColor: z.enum(["coral", "leaf", "mustard", "brown", "rose", "blue"]),
  }).safeParse({ displayName: formData.get("display_name"), servings: formData.get("servings"), avatarMode: formData.get("avatar_mode"), presetAvatarKey: formData.get("preset_avatar_key"), avatarColor: formData.get("avatar_color") });
  const family = familySettingsSchema.safeParse({ adults: formData.get("family_adults"), children: formData.get("family_children"), showFamily: formData.get("show_family") === "true" });
  if (!parsed.success || !family.success) redirect(`/settings/profile?error=${family.success ? "profile" : "family"}`);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/settings/profile");
  const { data: currentProfile } = await supabase.from("profiles").select("avatar_path").eq("user_id", data.user.id).single();
  let avatarPath = parsed.data.avatarMode === "upload" ? currentProfile?.avatar_path ?? null : null;
  let uploadedPath: string | null = null;
  const avatar = formData.get("avatar");
  if (parsed.data.avatarMode === "upload" && avatar instanceof File && avatar.size > 0) {
    let normalizedAvatar: ArrayBuffer;
    try {
      normalizedAvatar = await normalizeAvatarImage(avatar);
    } catch {
      redirect("/settings/profile?error=avatar");
    }
    uploadedPath = `${data.user.id}/avatar-${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(uploadedPath, normalizedAvatar, { contentType: "image/webp", upsert: false });
    if (uploadError) redirect("/settings/profile?error=avatar");
    avatarPath = uploadedPath;
  }
  if (parsed.data.avatarMode === "upload" && !avatarPath) redirect("/settings/profile?error=avatar");
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data.displayName, standard_servings: parsed.data.servings, family_adults: family.data.adults, family_children: family.data.children, show_family: family.data.showFamily, avatar_kind: parsed.data.avatarMode, preset_avatar_key: parsed.data.presetAvatarKey, avatar_color: parsed.data.avatarColor, avatar_path: avatarPath }).eq("user_id", data.user.id);
  if (error && uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
  if (error) redirect("/settings/profile?error=profile");
  if (currentProfile?.avatar_path && currentProfile.avatar_path !== avatarPath) await supabase.storage.from("avatars").remove([currentProfile.avatar_path]);
  revalidatePath("/mypage");
  revalidatePath(`/users/${data.user.id}`);
  revalidatePath("/", "layout");
  redirect("/settings/profile?message=saved");
}

export async function updateEmail(formData: FormData) {
  const parsed = z.string().trim().email().safeParse(formData.get("email"));
  const confirmation = String(formData.get("email_confirmation") ?? "").trim();
  if (!parsed.success || !valuesMatch(parsed.data, confirmation)) redirect("/settings/account?error=email-confirmation");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/settings/account");
  if (!data.user.identities?.some((identity) => identity.provider === "email") || !data.user.email) redirect("/settings/account?error=email-provider");
  const currentPassword = String(formData.get("current_password") ?? "");
  const { data: reauthenticated, error: authError } = await supabase.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
  if (authError || reauthenticated.user?.id !== data.user.id) redirect("/settings/account?error=reauthentication");
  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  redirect(error ? "/settings/account?error=email" : "/settings/account?message=email-sent");
}

export async function updatePassword(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmation = String(formData.get("new_password_confirmation") ?? "");
  if (!valuesMatch(newPassword, confirmation)) redirect("/settings/account?error=password-confirmation");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/settings/account");
  if (!data.user.email || !data.user.identities?.some((identity) => identity.provider === "email")) redirect("/settings/account?error=email-provider");
  const { data: reauthenticated, error: authError } = await supabase.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
  const policyError = await validateNewPassword(newPassword, [data.user.email]);
  if (authError || reauthenticated.user?.id !== data.user.id) redirect("/settings/account?error=reauthentication");
  if (policyError) redirect("/settings/account?error=password-policy");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  redirect(error ? "/settings/account?error=password" : "/settings/account?message=password-saved");
}

export async function signOutAll(formData: FormData) {
  if (formData.get("confirmation") !== SIGN_OUT_CONFIRMATION) redirect("/settings/account?error=signout-confirmation");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function linkGoogle() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/settings/connections");
  if (authData.user.identities?.some((identity) => identity.provider === "google")) redirect("/settings/connections?message=google-already-linked");
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl("/settings/connections?message=google-linked"),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/settings/connections?error=google-link");
  redirect(data.url);
}

export async function unlinkGoogle(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!valuesMatch(GOOGLE_UNLINK_CONFIRMATION, confirmation)) redirect("/settings/connections?error=google-confirmation");
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login?next=/settings/connections");
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");
  const hasEmailIdentity = user.identities?.some((identity) => identity.provider === "email");
  if (!googleIdentity) redirect("/settings/connections?error=google-not-linked");
  if (!hasEmailIdentity || !user.email || (user.identities?.length ?? 0) < 2) redirect("/settings/connections?error=google-last-identity");
  const { data: reauthenticated, error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (authError || reauthenticated.user?.id !== user.id) redirect("/settings/connections?error=reauthentication");
  const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
  if (error) redirect(`/settings/connections?error=${error.code === "single_identity_not_deletable" ? "google-last-identity" : "google-unlink"}`);
  revalidatePath("/settings/connections");
  redirect("/settings/connections?message=google-unlinked");
}

export async function requestAccountDeletion() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/settings/withdraw");
  const { error } = await supabase.from("account_deletion_requests").upsert({ user_id: data.user.id, status: "pending", requested_at: new Date().toISOString(), delete_after: new Date(Date.now() + 30 * 86400000).toISOString() });
  if (!error) await supabase.from("profiles").update({ account_status: "deletion_pending" }).eq("user_id", data.user.id);
  redirect(error ? "/settings/withdraw?error=withdraw" : "/settings/withdraw?message=requested");
}
