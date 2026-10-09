import { NextRequest, NextResponse } from "next/server";
import { getD1Database, usesD1AppData } from "../../../lib/d1-bindings";
import { r2ImageUrl } from "../../../lib/r2-images";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type EditorRecipe = Record<string, unknown> & {
  id: string;
  lock_version: number;
  status: "draft" | "published" | "deleted";
  recipe_ingredients: Array<Record<string, unknown>>;
  recipe_steps: Array<Record<string, unknown>>;
  recipe_tags: Array<{ tags: { name: string } | null }>;
};

/** レシピ編集画面で必要なデータを、アプリデータの読取元に合わせて返す。 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    const recipeId = request.nextUrl.searchParams.get("id");

    if (usesD1AppData()) {
      const db = await getD1Database();
      const categories = (await db.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name").all<{ id: string; name: string }>()).results ?? [];
      if (!recipeId) return NextResponse.json({ categories, recipe: null }, { headers: { "Cache-Control": "no-store" } });
      const recipe = await db.prepare(`SELECT id, lock_version, status, title, description, base_servings, category_id, cooking_time_minutes, calories_per_serving, visibility, allergy_notes, image_key, updated_at
        FROM recipes WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`).bind(recipeId, authData.user.id).first<Record<string, unknown> & { image_key: string | null; id: string; lock_version: number; status: "draft" | "published" | "deleted" }>();
      if (!recipe) return NextResponse.json({ categories, recipe: null }, { headers: { "Cache-Control": "no-store" } });
      const [ingredients, steps, tags] = await Promise.all([
        db.prepare("SELECT id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, sort_order FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order").bind(recipeId).all<Record<string, unknown>>(),
        db.prepare("SELECT id, instruction, image_key, sort_order FROM recipe_steps WHERE recipe_id = ? ORDER BY sort_order").bind(recipeId).all<Record<string, unknown> & { image_key: string | null }>(),
        db.prepare("SELECT tags.name FROM recipe_tags JOIN tags ON tags.id = recipe_tags.tag_id WHERE recipe_tags.recipe_id = ? ORDER BY tags.name").bind(recipeId).all<{ name: string }>(),
      ]);
      const editorRecipe: EditorRecipe = {
        ...recipe,
        image_path: recipe.image_key,
        image_url: recipe.image_key ? r2ImageUrl(recipe.image_key) : null,
        recipe_ingredients: ingredients.results ?? [],
        recipe_steps: (steps.results ?? []).map((step) => ({ ...step, image_path: step.image_key, image_url: step.image_key ? r2ImageUrl(step.image_key) : null })),
        recipe_tags: (tags.results ?? []).map((tag) => ({ tags: { name: tag.name } })),
      };
      return NextResponse.json({ categories, recipe: editorRecipe }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data: categories, error: categoriesError } = await supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order");
    if (categoriesError) throw categoriesError;
    if (!recipeId) return NextResponse.json({ categories: categories ?? [], recipe: null }, { headers: { "Cache-Control": "no-store" } });
    const { data: recipe, error } = await supabase.from("recipes").select("*, recipe_ingredients(*), recipe_steps(*), recipe_tags(tags(name))").eq("id", recipeId).eq("owner_user_id", authData.user.id).single();
    if (error || !recipe) return NextResponse.json({ categories: categories ?? [], recipe: null }, { headers: { "Cache-Control": "no-store" } });
    const stepPaths = (recipe.recipe_steps ?? []).flatMap((step: { image_path?: string | null }) => step.image_path ? [step.image_path] : []);
    const { data: stepImages } = stepPaths.length ? await supabase.storage.from("recipe-images").createSignedUrls(stepPaths, 3600) : { data: [] };
    const urls = new Map((stepImages ?? []).map((image) => [image.path, image.signedUrl]));
    const { data: cover } = recipe.image_path ? await supabase.storage.from("recipe-images").createSignedUrl(recipe.image_path, 3600) : { data: null };
    return NextResponse.json({ categories: categories ?? [], recipe: { ...recipe, image_url: cover?.signedUrl ?? null, recipe_steps: (recipe.recipe_steps ?? []).map((step: Record<string, unknown> & { image_path?: string | null }) => ({ ...step, image_url: step.image_path ? urls.get(step.image_path) ?? null : null })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "レシピ編集情報を読み込めませんでした。" }, { status: 503 });
  }
}
