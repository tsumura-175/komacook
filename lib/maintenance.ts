import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimedRecipeDeletion = { recipe_id: string; image_path: string | null };

export async function deleteClaimedRecipe(supabase: SupabaseClient, item: ClaimedRecipeDeletion) {
  const { data: steps, error: stepsError } = await supabase.from("recipe_steps").select("image_path").eq("recipe_id", item.recipe_id);
  if (stepsError) throw stepsError;
  const imagePaths = [item.image_path, ...(steps ?? []).map((step) => step.image_path)].filter((path): path is string => Boolean(path));
  if (imagePaths.length) {
    const { error } = await supabase.storage.from("recipe-images").remove(imagePaths);
    if (error) throw error;
  }
  const { data, error } = await supabase.from("recipes").delete().eq("id", item.recipe_id).eq("status", "deleted").select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("削除対象のレシピが見つかりませんでした。");
}

export async function deleteAccountData(supabase: SupabaseClient, userId: string) {
  const [{ data: profile, error: profileError }, { data: recipes, error: recipesError }] = await Promise.all([
    supabase.from("profiles").select("avatar_path").eq("user_id", userId).maybeSingle(),
    supabase.from("recipes").select("id, visibility, image_path, recipe_steps(image_path)").eq("owner_user_id", userId),
  ]);
  if (profileError) throw profileError;
  if (recipesError) throw recipesError;

  const privateRecipes = (recipes ?? []).filter((recipe) => recipe.visibility === "private");
  const privateImagePaths = privateRecipes.flatMap((recipe) => [recipe.image_path, ...(recipe.recipe_steps ?? []).map((step) => step.image_path)].filter((path): path is string => Boolean(path)));
  if (privateImagePaths.length) {
    const { error } = await supabase.storage.from("recipe-images").remove(privateImagePaths);
    if (error) throw error;
  }
  if (profile?.avatar_path) {
    const { error } = await supabase.storage.from("avatars").remove([profile.avatar_path]);
    if (error) throw error;
  }
  if (privateRecipes.length) {
    const { error } = await supabase.from("recipes").delete().in("id", privateRecipes.map((recipe) => recipe.id));
    if (error) throw error;
  }
  const { error: anonymizeError } = await supabase.from("recipes").update({ owner_user_id: null, source_author_user_id: null }).eq("owner_user_id", userId).eq("visibility", "public");
  if (anonymizeError) throw anonymizeError;
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw authError;
}
