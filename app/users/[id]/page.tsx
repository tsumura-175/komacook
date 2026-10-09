import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faUtensils } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav, SiteFooter, SiteHeader } from "../../components/site-shell";
import { ReportButton } from "../../components/report-button";
import { getPublicRecipesByOwner } from "../../../lib/recipes";
import { createClient } from "../../../lib/supabase/server";
import { ProfileAvatar } from "../../components/profile-avatar";
import { RecipeThumbnail } from "../../components/recipe-thumbnail";
import { d1AvatarUrl, getD1Profile } from "../../../lib/d1-profiles";
import { usesD1AppData } from "../../../lib/d1-bindings";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const d1 = usesD1AppData();
  const [{ data: legacyProfile }, d1Profile, { data: authData }, recipes] = await Promise.all([
    d1 ? Promise.resolve({ data: null }) : supabase.from("public_profiles").select("user_id, display_name, family_adults, family_children, avatar_kind, preset_avatar_key, avatar_color, avatar_path").eq("user_id", id).maybeSingle(),
    d1 ? getD1Profile(id) : Promise.resolve(null),
    supabase.auth.getUser(),
    getPublicRecipesByOwner(id).catch(() => []),
  ]);
  const profile = d1Profile ? {
    user_id: d1Profile.user_id, display_name: d1Profile.display_name,
    family_adults: d1Profile.show_family ? d1Profile.family_adults : null,
    family_children: d1Profile.show_family ? d1Profile.family_children : null,
    avatar_kind: d1Profile.avatar_kind, preset_avatar_key: d1Profile.preset_avatar_key,
    avatar_color: d1Profile.avatar_color, avatar_path: null,
  } : legacyProfile;
  if (!profile) notFound();
  const avatarUrl = d1Profile ? d1AvatarUrl(d1Profile) : profile.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
  const familyParts = [profile.family_adults !== null ? `大人${profile.family_adults}人` : "", profile.family_children !== null ? `子ども${profile.family_children}人` : ""].filter(Boolean);

  return <div className="app-shell member-page-shell"><SiteHeader /><main className="member-page-main">
    <section className="management-panel public-profile-card"><ProfileAvatar avatarKind={profile.avatar_kind} presetKey={profile.preset_avatar_key} color={profile.avatar_color} imageUrl={avatarUrl} className="profile-avatar-large" /><div><h1>{profile.display_name}</h1><p>{familyParts.length ? `${familyParts.join("・")}のごはんを作っています。` : "こまクックでレシピを公開しています。"}</p></div>{authData.user?.id !== profile.user_id ? <ReportButton className="outline-action" targetType="profile" targetId={profile.user_id} label="プロフィールを通報" showIcon /> : null}</section>
    <section className="recipe-section"><div className="member-section-heading"><div><h2>公開レシピ</h2><p>{recipes.length}件公開しています</p></div></div>
      {recipes.length ? <div className="my-recipe-grid">{recipes.map((recipe) => <article className="my-recipe-card" key={recipe.id}><div className="my-recipe-image"><RecipeThumbnail imageUrl={recipe.imageUrl} title={recipe.title} sizes="(max-width: 600px) 100vw, 33vw" /></div><div className="my-recipe-body"><div className="recipe-meta"><span><FontAwesomeIcon icon={faClock} />{recipe.cookingTime ? `${recipe.cookingTime}分` : "時間未設定"}</span></div><h3>{recipe.title}</h3><div className="recipe-tags"><span className="recipe-tag">{recipe.category}</span>{recipe.tags.map((tag) => <span className="recipe-tag" key={tag}>{tag}</span>)}</div><Link className="secondary-button" href={`/recipes/${recipe.id}`}>レシピを見る</Link></div></article>)}</div> : <div className="member-empty"><FontAwesomeIcon icon={faUtensils} /><h3>公開レシピはまだありません</h3></div>}
    </section>
  </main><SiteFooter /><BottomNav /></div>;
}
