import { createClient } from "./supabase/server";

export type RecipeIngredient = {
  id: string;
  name: string;
  quantityValue: number | null;
  quantityDisplay: string | null;
  quantityText: string | null;
  unit: string | null;
  note: string | null;
  group: string | null;
  scalable: boolean;
  sortOrder: number;
};

export type RecipeStep = { id: string; instruction: string; sortOrder: number; imageUrl: string | null };

export type RecipeData = {
  id: string;
  ownerUserId: string | null;
  viewerUserId: string | null;
  title: string;
  description: string;
  baseServings: number;
  cookingTime: number | null;
  calories: number | null;
  allergyNotes: string;
  visibility: "public" | "private";
  status: "draft" | "published" | "deleted";
  sourceType: "manual" | "copied";
  imageUrl: string | null;
  categoryId: string;
  category: string;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  author: string;
  saveCount: number;
  favorite: boolean;
  publishedAt: string | null;
  updatedAt: string;
  purgeAfter: string | null;
};

type RawRecipe = {
  id: string;
  owner_user_id: string | null;
  category_id: string;
  title: string;
  description: string | null;
  base_servings: number | string;
  cooking_time_minutes: number | null;
  calories_per_serving: number | null;
  allergy_notes: string | null;
  visibility: "public" | "private";
  status: "draft" | "published" | "deleted";
  source_type: "manual" | "copied";
  image_path: string | null;
  published_at: string | null;
  updated_at: string;
  purge_after: string | null;
  categories: { name: string } | { name: string }[] | null;
  recipe_ingredients: Array<{
    id: string;
    name: string;
    quantity_value: number | string | null;
    quantity_display: string | null;
    quantity_text: string | null;
    unit: string | null;
    note: string | null;
    group_name: string | null;
    is_scalable: boolean;
    sort_order: number;
  }>;
  recipe_steps: Array<{ id: string; instruction: string; sort_order: number; image_path: string | null }>;
  recipe_tags: Array<{ tags: { name: string } | { name: string }[] | null }>;
};

const recipeSelect = `
  id, owner_user_id, category_id, title, description, base_servings,
  cooking_time_minutes, calories_per_serving, allergy_notes, visibility, status,
  source_type, image_path, published_at, updated_at, purge_after,
  categories(name),
  recipe_ingredients(id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order),
  recipe_steps(id, instruction, sort_order, image_path),
  recipe_tags(tags(name))
`;

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function enrichRecipes(rawRecipes: RawRecipe[]): Promise<RecipeData[]> {
  if (!rawRecipes.length) return [];
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  const recipeIds = rawRecipes.map((recipe) => recipe.id);
  const ownerIds = [...new Set(rawRecipes.map((recipe) => recipe.owner_user_id).filter((id): id is string => Boolean(id)))];

  const [profilesResult, countsResult, favoritesResult] = await Promise.all([
    ownerIds.length
      ? supabase.from("public_profiles").select("user_id, display_name").in("user_id", ownerIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string }> }),
    supabase.from("recipe_save_counts").select("recipe_id, save_count").in("recipe_id", recipeIds),
    userId
      ? supabase.from("favorites").select("recipe_id").eq("user_id", userId).in("recipe_id", recipeIds)
      : Promise.resolve({ data: [] as Array<{ recipe_id: string }> }),
  ]);

  const profileMap = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile.display_name]));
  const countMap = new Map((countsResult.data ?? []).map((count) => [count.recipe_id, count.save_count]));
  const favoriteIds = new Set((favoritesResult.data ?? []).map((favorite) => favorite.recipe_id));

  const imagePaths = [...new Set(rawRecipes.flatMap((recipe) => [recipe.image_path, ...recipe.recipe_steps.map((step) => step.image_path)].filter((path): path is string => Boolean(path))))];
  const { data: signedImages } = imagePaths.length
    ? await supabase.storage.from("recipe-images").createSignedUrls(imagePaths, 3600)
    : { data: [] as Array<{ path: string; signedUrl: string | null }> };
  const imageUrls = new Map((signedImages ?? []).map((item) => [item.path, item.signedUrl]));
  return rawRecipes.map((recipe) => {
    const category = firstRelation(recipe.categories);
    return {
      id: recipe.id,
      ownerUserId: recipe.owner_user_id,
      viewerUserId: userId ?? null,
      title: recipe.title,
      description: recipe.description ?? "",
      baseServings: Number(recipe.base_servings),
      cookingTime: recipe.cooking_time_minutes,
      calories: recipe.calories_per_serving,
      allergyNotes: recipe.allergy_notes ?? "",
      visibility: recipe.visibility,
      status: recipe.status,
      sourceType: recipe.source_type,
      imageUrl: recipe.image_path ? imageUrls.get(recipe.image_path) ?? null : null,
      categoryId: recipe.category_id,
      category: category?.name ?? "その他",
      tags: recipe.recipe_tags.flatMap((item) => {
        const tag = firstRelation(item.tags);
        return tag ? [tag.name] : [];
      }),
      ingredients: recipe.recipe_ingredients
        .toSorted((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({
          id: item.id,
          name: item.name,
          quantityValue: item.quantity_value === null ? null : Number(item.quantity_value),
          quantityDisplay: item.quantity_display,
          quantityText: item.quantity_text,
          unit: item.unit,
          note: item.note,
          group: item.group_name,
          scalable: item.is_scalable,
          sortOrder: item.sort_order,
        })),
      steps: recipe.recipe_steps
        .toSorted((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({ id: item.id, instruction: item.instruction, sortOrder: item.sort_order, imageUrl: item.image_path ? imageUrls.get(item.image_path) ?? null : null })),
      author: recipe.owner_user_id ? profileMap.get(recipe.owner_user_id) ?? "退会したユーザー" : "退会したユーザー",
      saveCount: countMap.get(recipe.id) ?? 0,
      favorite: favoriteIds.has(recipe.id),
      publishedAt: recipe.published_at,
      updatedAt: recipe.updated_at,
      purgeAfter: recipe.purge_after,
    } satisfies RecipeData;
  });
}

export async function getPublicRecipes(limit?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select(recipeSelect)
    .eq("visibility", "public")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`公開レシピを取得できませんでした: ${error.message}`);
  return enrichRecipes((data ?? []) as unknown as RawRecipe[]);
}

export type RecipeSearchFilters = {
  query?: string;
  categoryId?: string;
  tags?: string[];
  maxTime?: number;
  ingredient?: string;
  periodDays?: number;
  favoritesOnly?: boolean;
  sort?: "relevance" | "new" | "saves";
  page?: number;
  pageSize?: number;
};

export async function searchPublicRecipes(filters: RecipeSearchFilters = {}) {
  const supabase = await createClient();
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 50);
  const page = Math.max(filters.page ?? 1, 1);
  const { data: rows, error } = await supabase.rpc("search_public_recipes", {
    p_query: filters.query ?? "",
    p_category_id: filters.categoryId || null,
    p_tags: filters.tags ?? [],
    p_max_time: filters.maxTime ?? null,
    p_ingredient: filters.ingredient ?? "",
    p_period_days: filters.periodDays ?? null,
    p_favorites_only: filters.favoritesOnly ?? false,
    p_sort: filters.sort ?? (filters.query ? "relevance" : "new"),
    p_offset: (page - 1) * pageSize,
    p_limit: pageSize,
  });
  if (error) throw new Error(`公開レシピを検索できませんでした: ${error.message}`);
  const resultRows = (rows ?? []) as Array<{ recipe_id: string; total_count: number | string }>;
  const ids = resultRows.map((row) => row.recipe_id);
  if (!ids.length) return { recipes: [] as RecipeData[], total: 0, page, pageSize };
  const { data: recipes, error: recipeError } = await supabase.from("recipes").select(recipeSelect).in("id", ids);
  if (recipeError) throw new Error(`検索結果を取得できませんでした: ${recipeError.message}`);
  const byId = new Map((recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const ordered = ids.flatMap((id) => {
    const recipe = byId.get(id);
    return recipe ? [recipe] : [];
  });
  return { recipes: await enrichRecipes(ordered as unknown as RawRecipe[]), total: Number(resultRows[0]?.total_count ?? 0), page, pageSize };
}

export async function getPopularRecipes(limit = 3) {
  return (await searchPublicRecipes({ sort: "saves", pageSize: limit })).recipes;
}

export async function getPublicRecipesByOwner(ownerUserId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(recipeSelect)
    .eq("owner_user_id", ownerUserId)
    .eq("visibility", "public")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`投稿者の公開レシピを取得できませんでした: ${error.message}`);
  return enrichRecipes((data ?? []) as unknown as RawRecipe[]);
}

export async function getRecipe(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select(recipeSelect).eq("id", id).maybeSingle();
  if (error) throw new Error(`レシピを取得できませんでした: ${error.message}`);
  if (!data) return null;
  return (await enrichRecipes([data as unknown as RawRecipe]))[0];
}

export async function getMyRecipes() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];
  const { data, error } = await supabase
    .from("recipes")
    .select(recipeSelect)
    .eq("owner_user_id", authData.user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`マイレシピを取得できませんでした: ${error.message}`);
  return enrichRecipes((data ?? []) as unknown as RawRecipe[]);
}

export async function getFavoriteRecipes() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];
  const { data: favoriteRows, error } = await supabase
    .from("favorites")
    .select("recipe_id")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false });
  if (error || !favoriteRows?.length) return [];
  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select(recipeSelect)
    .in("id", favoriteRows.map((row) => row.recipe_id));
  if (recipesError) throw new Error(`保存したレシピを取得できませんでした: ${recipesError.message}`);
  const byId = new Map((recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const ordered = favoriteRows.flatMap((favorite) => {
    const recipe = byId.get(favorite.recipe_id);
    return recipe ? [recipe] : [];
  });
  return enrichRecipes(ordered as unknown as RawRecipe[]);
}

export async function getCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order");
  if (error) throw new Error(`カテゴリを取得できませんでした: ${error.message}`);
  return data ?? [];
}

export async function getSearchOptions() {
  const supabase = await createClient();
  const [categories, tagsResult, ingredientsResult] = await Promise.all([
    getCategories(),
    supabase.from("tags").select("name").eq("is_active", true).order("name"),
    supabase.from("recipe_ingredients").select("name").limit(300),
  ]);
  const ingredients = [...new Set((ingredientsResult.data ?? []).map((item) => item.name.trim()).filter(Boolean))]
    .toSorted((a, b) => a.localeCompare(b, "ja"))
    .slice(0, 30);
  return { categories, tags: (tagsResult.data ?? []).map((tag) => tag.name), ingredients };
}

export async function getHomeNotices(limit = 3) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notices").select("id,title,publish_at,is_pinned").order("is_pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`お知らせを取得できませんでした: ${error.message}`);
  return data ?? [];
}

export async function getViewer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const [{ data: profile }, { count: recipeCount }, { count: favoriteCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", authData.user.id).single(),
    supabase.from("recipes").select("id", { count: "exact", head: true }).eq("owner_user_id", authData.user.id).neq("status", "deleted"),
    supabase.from("favorites").select("recipe_id", { count: "exact", head: true }).eq("user_id", authData.user.id),
  ]);
  const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
  return { user: authData.user, profile, avatarUrl, recipeCount: recipeCount ?? 0, favoriteCount: favoriteCount ?? 0 };
}
