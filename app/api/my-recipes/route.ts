import { NextResponse } from "next/server";
import { getCategories, getFavoriteRecipes, getMyRecipes, type RecipeData } from "../../../lib/recipes";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function updatedLabel(recipe: RecipeData) {
  if (recipe.status === "deleted" && recipe.purgeAfter) {
    return `あと${Math.max(0, Math.ceil((new Date(recipe.purgeAfter).getTime() - Date.now()) / 86_400_000))}日`;
  }
  return new Date(recipe.updatedAt).toLocaleDateString("ja-JP");
}

function ownRecipe(recipe: RecipeData) {
  return {
    id: recipe.id,
    name: recipe.title,
    category: recipe.category,
    tags: recipe.tags,
    time: recipe.cookingTime ?? 0,
    visibility: recipe.visibility === "public" ? "公開" : "非公開",
    source: recipe.status === "deleted" ? "削除済み" : recipe.status === "draft" ? "下書き" : recipe.sourceType === "copied" ? "コピー" : "手入力",
    tab: recipe.status === "deleted" ? "trash" : recipe.status === "draft" ? "drafts" : "mine",
    updatedAt: recipe.updatedAt,
    updatedLabel: updatedLabel(recipe),
    imageUrl: recipe.imageUrl,
  };
}

function favoriteRecipe(recipe: RecipeData) {
  return {
    id: recipe.id,
    name: recipe.title,
    category: recipe.category,
    tags: recipe.tags,
    time: recipe.cookingTime ?? 0,
    visibility: "公開",
    source: "保存済み",
    tab: "favorites",
    updatedAt: recipe.updatedAt,
    updatedLabel: new Date(recipe.updatedAt).toLocaleDateString("ja-JP"),
    imageUrl: recipe.imageUrl,
  };
}

/** マイレシピ画面の読取元をD1/Supabase切替と常に一致させる。 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

    const [mine, favorites, categories] = await Promise.all([getMyRecipes(), getFavoriteRecipes(), getCategories()]);
    const recipes = [...mine.map(ownRecipe), ...favorites.map(favoriteRecipe)];
    return NextResponse.json({ recipes, categories: categories.map((category) => category.name), savedRecipeIds: favorites.map((recipe) => recipe.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "マイレシピを読み込めませんでした。時間をおいて再度お試しください。" }, { status: 503 });
  }
}
