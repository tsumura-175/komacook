import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/onboarding");

  const { data: profile } = await supabase.from("profiles")
    .select("display_name, standard_servings, family_adults, family_children, show_family, avatar_kind, preset_avatar_key, avatar_color, avatar_path, onboarding_completed")
    .eq("user_id", authData.user.id)
    .single();
  if (profile?.onboarding_completed) redirect("/");

  const avatarUrl = profile?.avatar_path
    ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null
    : null;
  const metadataName = String(authData.user.user_metadata.full_name ?? authData.user.user_metadata.name ?? "").trim();
  const initialDisplayName = profile?.display_name === "こまクックユーザー" && metadataName ? metadataName.slice(0, 30) : profile?.display_name ?? metadataName;

  return <OnboardingForm
    userId={authData.user.id}
    initialProfile={{
      displayName: initialDisplayName,
      servings: String(profile?.standard_servings ?? 2),
      adults: profile?.family_adults == null ? "" : String(profile.family_adults),
      children: profile?.family_children == null ? "" : String(profile.family_children),
      familyPublic: profile?.show_family ? "public" : "private",
      avatarKind: profile?.avatar_kind === "upload" ? "upload" : "preset",
      avatarKey: profile?.preset_avatar_key ?? "utensils",
      avatarColor: profile?.avatar_color ?? "coral",
      avatarUrl,
    }}
    confirmedEmail={authData.user.email_confirmed_at ? authData.user.email ?? null : null}
  />;
}
