import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { d1AvatarUrl, ensureD1Profile } from "../../lib/d1-profiles";
import { usesD1AppData } from "../../lib/d1-bindings";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/onboarding");

  const d1Profile = usesD1AppData()
    ? await ensureD1Profile(authData.user.id, String(authData.user.user_metadata.full_name ?? authData.user.user_metadata.name ?? "").trim() || "こまクックユーザー")
    : null;
  const { data: profile } = d1Profile ? { data: null } : await supabase.from("profiles")
    .select("display_name, standard_servings, family_adults, family_children, show_family, avatar_kind, preset_avatar_key, avatar_color, avatar_path, onboarding_completed")
    .eq("user_id", authData.user.id)
    .single();
  const activeProfile = d1Profile ?? profile;
  if (activeProfile?.onboarding_completed) redirect("/");

  const avatarUrl = d1Profile ? d1AvatarUrl(d1Profile) : profile?.avatar_path
    ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null
    : null;
  const metadataName = String(authData.user.user_metadata.full_name ?? authData.user.user_metadata.name ?? "").trim();
  const initialDisplayName = activeProfile?.display_name === "こまクックユーザー" && metadataName ? metadataName.slice(0, 30) : activeProfile?.display_name ?? metadataName;

  return <OnboardingForm
    userId={authData.user.id}
    initialProfile={{
      displayName: initialDisplayName,
      servings: String(activeProfile?.standard_servings ?? 2),
      adults: activeProfile?.family_adults == null ? "" : String(activeProfile.family_adults),
      children: activeProfile?.family_children == null ? "" : String(activeProfile.family_children),
      familyPublic: activeProfile?.show_family ? "public" : "private",
      avatarKind: activeProfile?.avatar_kind === "upload" ? "upload" : "preset",
      avatarKey: activeProfile?.preset_avatar_key ?? "utensils",
      avatarColor: activeProfile?.avatar_color ?? "coral",
      avatarUrl,
    }}
    confirmedEmail={authData.user.email_confirmed_at ? authData.user.email ?? null : null}
  />;
}
