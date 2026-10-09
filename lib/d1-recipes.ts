import "server-only";
import type { RecipeData, RecipeIngredient, RecipeStep, RecipeSearchFilters } from "./recipes";
import { getD1Database } from "./d1-bindings";
import { r2ImageUrl } from "./r2-images";

type RecipeRow = {
  id: string; owner_user_id: string | null; category_id: string | null; title: string; description: string | null;
  base_servings: number; cooking_time_minutes: number | null; calories_per_serving: number | null; allergy_notes: string | null;
  visibility: "public" | "private"; status: "draft" | "published" | "deleted"; source_type: "manual" | "copied";
  image_key: string | null; published_at: string | null; updated_at: string; purge_after: string | null; category_name: string | null;
  total_count?: number; save_count?: number;
};
type IngredientRow = { id: string; recipe_id: string; name: string; quantity_value: number | null; quantity_display: string | null; quantity_text: string | null; unit: string | null; note: string | null; group_name: string | null; is_scalable: number; sort_order: number };
type StepRow = { id: string; recipe_id: string; instruction: string; image_key: string | null; sort_order: number };
type TagRow = { recipe_id: string; name: string };

function placeholders(values: readonly string[]) {
  return values.map(() => "?").join(", ");
}

async function hydrate(rows: RecipeRow[], viewerUserId: string | null): Promise<RecipeData[]> {
  if (!rows.length) return [];
  const db = await getD1Database();
  const ids = rows.map((row) => row.id);
  const slots = placeholders(ids);
  const [ingredientsResult, stepsResult, tagsResult, profilesResult, savesResult, favoritesResult] = await Promise.all([
    db.prepare(`SELECT id, recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order FROM recipe_ingredients WHERE recipe_id IN (${slots}) ORDER BY sort_order`).bind(...ids).all<IngredientRow>(),
    db.prepare(`SELECT id, recipe_id, instruction, image_key, sort_order FROM recipe_steps WHERE recipe_id IN (${slots}) ORDER BY sort_order`).bind(...ids).all<StepRow>(),
    db.prepare(`SELECT recipe_tags.recipe_id, tags.name FROM recipe_tags JOIN tags ON tags.id = recipe_tags.tag_id WHERE recipe_tags.recipe_id IN (${slots}) ORDER BY tags.name`).bind(...ids).all<TagRow>(),
    db.prepare(`SELECT user_id, display_name FROM profiles WHERE user_id IN (${placeholders(rows.flatMap((row) => row.owner_user_id ? [row.owner_user_id] : [])) || "NULL"})`).bind(...rows.flatMap((row) => row.owner_user_id ? [row.owner_user_id] : [])).all<{ user_id: string; display_name: string }>(),
    db.prepare(`SELECT recipe_id, COUNT(*) AS save_count FROM favorites WHERE recipe_id IN (${slots}) GROUP BY recipe_id`).bind(...ids).all<{ recipe_id: string; save_count: number }>(),
    viewerUserId ? db.prepare(`SELECT recipe_id FROM favorites WHERE user_id = ? AND recipe_id IN (${slots})`).bind(viewerUserId, ...ids).all<{ recipe_id: string }>() : Promise.resolve({ results: [] as Array<{ recipe_id: string }> }),
  ]);
  const byRecipe = <T extends { recipe_id: string }>(values: T[]) => values.reduce((map, item) => {
    const current = map.get(item.recipe_id) ?? [];
    current.push(item); map.set(item.recipe_id, current); return map;
  }, new Map<string, T[]>());
  const ingredientMap = byRecipe(ingredientsResult.results ?? []);
  const stepMap = byRecipe(stepsResult.results ?? []);
  const tagMap = byRecipe(tagsResult.results ?? []);
  const profileMap = new Map((profilesResult.results ?? []).map((profile) => [profile.user_id, profile.display_name]));
  const saveMap = new Map((savesResult.results ?? []).map((save) => [save.recipe_id, Number(save.save_count)]));
  const favoriteIds = new Set((favoritesResult.results ?? []).map((favorite) => favorite.recipe_id));
  return rows.map((row) => ({
    id: row.id, ownerUserId: row.owner_user_id, viewerUserId, title: row.title, description: row.description ?? "",
    baseServings: Number(row.base_servings), cookingTime: row.cooking_time_minutes, calories: row.calories_per_serving,
    allergyNotes: row.allergy_notes ?? "", visibility: row.visibility, status: row.status, sourceType: row.source_type,
    imageUrl: row.image_key ? r2ImageUrl(row.image_key) : null, categoryId: row.category_id ?? "", category: row.category_name ?? "その他",
    tags: (tagMap.get(row.id) ?? []).map((tag) => tag.name),
    ingredients: (ingredientMap.get(row.id) ?? []).map((item): RecipeIngredient => ({
      id: item.id, name: item.name, quantityValue: item.quantity_value === null ? null : Number(item.quantity_value), quantityDisplay: item.quantity_display,
      quantityText: item.quantity_text, unit: item.unit, note: item.note, group: item.group_name, scalable: Boolean(item.is_scalable), sortOrder: item.sort_order,
    })),
    steps: (stepMap.get(row.id) ?? []).map((item): RecipeStep => ({ id: item.id, instruction: item.instruction, sortOrder: item.sort_order, imageUrl: item.image_key ? r2ImageUrl(item.image_key) : null })),
    author: row.owner_user_id ? profileMap.get(row.owner_user_id) ?? "退会したユーザー" : "退会したユーザー",
    saveCount: Number(row.save_count ?? saveMap.get(row.id) ?? 0), favorite: favoriteIds.has(row.id), publishedAt: row.published_at,
    updatedAt: row.updated_at, purgeAfter: row.purge_after,
  }));
}

const recipeColumns = `
  recipe.id, recipe.owner_user_id, recipe.category_id, recipe.title, recipe.description, recipe.base_servings,
  recipe.cooking_time_minutes, recipe.calories_per_serving, recipe.allergy_notes, recipe.visibility, recipe.status,
  recipe.source_type, recipe.image_key, recipe.published_at, recipe.updated_at, recipe.purge_after, category.name AS category_name
`;

export async function getD1PublicRecipes(limit?: number, viewerUserId: string | null = null) {
  const db = await getD1Database();
  const suffix = limit ? " LIMIT ?" : "";
  const statement = db.prepare(`SELECT ${recipeColumns} FROM recipes AS recipe LEFT JOIN categories AS category ON category.id = recipe.category_id WHERE recipe.visibility = 'public' AND recipe.status = 'published' AND recipe.deleted_at IS NULL ORDER BY recipe.published_at DESC, recipe.id DESC${suffix}`);
  const result = await (limit ? statement.bind(limit).all<RecipeRow>() : statement.all<RecipeRow>());
  return hydrate(result.results ?? [], viewerUserId);
}

export async function searchD1PublicRecipes(filters: RecipeSearchFilters, viewerUserId: string | null) {
  const db = await getD1Database();
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 50);
  const page = Math.max(filters.page ?? 1, 1);
  if (filters.favoritesOnly && !viewerUserId) return { recipes: [] as RecipeData[], total: 0, page, pageSize };
  const query = (filters.query ?? "").trim();
  const terms = query.toLocaleLowerCase("ja").split(/\s+/).filter(Boolean);
  const where = ["recipe.visibility = 'public'", "recipe.status = 'published'", "recipe.deleted_at IS NULL"];
  const params: Array<string | number> = [];
  if (filters.categoryId) { where.push("recipe.category_id = ?"); params.push(filters.categoryId); }
  if (filters.maxTime) { where.push("recipe.cooking_time_minutes <= ?"); params.push(filters.maxTime); }
  if (filters.periodDays) { where.push("recipe.published_at >= datetime('now', ?)"); params.push(`-${filters.periodDays} days`); }
  if (filters.ingredient) { where.push("EXISTS (SELECT 1 FROM recipe_ingredients AS ingredient WHERE ingredient.recipe_id = recipe.id AND lower(ingredient.name) LIKE ?)"); params.push(`%${filters.ingredient.toLocaleLowerCase("ja")}%`); }
  if (filters.favoritesOnly && viewerUserId) { where.push("EXISTS (SELECT 1 FROM favorites AS favorite WHERE favorite.recipe_id = recipe.id AND favorite.user_id = ?)"); params.push(viewerUserId); }
  for (const tag of filters.tags ?? []) { where.push("EXISTS (SELECT 1 FROM recipe_tags AS recipe_tag JOIN tags AS tag ON tag.id = recipe_tag.tag_id WHERE recipe_tag.recipe_id = recipe.id AND tag.name = ?)"); params.push(tag); }
  for (const term of terms) {
    where.push(`(lower(recipe.title) LIKE ? OR lower(COALESCE(recipe.description, '')) LIKE ? OR EXISTS (SELECT 1 FROM recipe_ingredients AS ingredient WHERE ingredient.recipe_id = recipe.id AND lower(ingredient.name) LIKE ?) OR EXISTS (SELECT 1 FROM recipe_tags AS recipe_tag JOIN tags AS tag ON tag.id = recipe_tag.tag_id WHERE recipe_tag.recipe_id = recipe.id AND lower(tag.name) LIKE ?))`);
    const pattern = `%${term}%`; params.push(pattern, pattern, pattern, pattern);
  }
  const sort = filters.sort ?? (query ? "relevance" : "new");
  const relevance = query ? "(CASE WHEN lower(recipe.title) LIKE ? THEN 8 ELSE 0 END + CASE WHEN lower(COALESCE(recipe.description, '')) LIKE ? THEN 1 ELSE 0 END)" : "0";
  const relevanceParams = query ? [`%${query.toLocaleLowerCase("ja")}%`, `%${query.toLocaleLowerCase("ja")}%`] : [];
  const order = sort === "saves" ? "save_count DESC, recipe.published_at DESC, recipe.id DESC" : sort === "relevance" ? "relevance DESC, recipe.published_at DESC, recipe.id DESC" : "recipe.published_at DESC, recipe.id DESC";
  const sql = `SELECT ${recipeColumns}, ${relevance} AS relevance, (SELECT COUNT(*) FROM favorites AS favorite WHERE favorite.recipe_id = recipe.id) AS save_count, COUNT(*) OVER () AS total_count FROM recipes AS recipe LEFT JOIN categories AS category ON category.id = recipe.category_id WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const result = await db.prepare(sql).bind(...relevanceParams, ...params, pageSize, (page - 1) * pageSize).all<RecipeRow>();
  const rows = result.results ?? [];
  return { recipes: await hydrate(rows, viewerUserId), total: Number(rows[0]?.total_count ?? 0), page, pageSize };
}

export async function getD1Recipe(recipeId: string, viewerUserId: string | null) {
  const db = await getD1Database();
  const row = await db.prepare(`SELECT ${recipeColumns} FROM recipes AS recipe LEFT JOIN categories AS category ON category.id = recipe.category_id WHERE recipe.id = ? AND (recipe.owner_user_id = ? OR (recipe.visibility = 'public' AND recipe.status = 'published' AND recipe.deleted_at IS NULL)) LIMIT 1`).bind(recipeId, viewerUserId ?? "").first<RecipeRow>();
  if (!row) return null;
  return (await hydrate([row], viewerUserId))[0] ?? null;
}

export async function getD1RecipesByOwner(userId: string, viewerUserId: string | null) {
  const db = await getD1Database();
  const visible = viewerUserId === userId ? "" : " AND recipe.visibility = 'public' AND recipe.status = 'published' AND recipe.deleted_at IS NULL";
  const rows = await db.prepare(`SELECT ${recipeColumns} FROM recipes AS recipe LEFT JOIN categories AS category ON category.id = recipe.category_id WHERE recipe.owner_user_id = ?${visible} ORDER BY recipe.updated_at DESC`).bind(userId).all<RecipeRow>();
  return hydrate(rows.results ?? [], viewerUserId);
}

export async function getD1FavoriteRecipes(userId: string) {
  const db = await getD1Database();
  const rows = await db.prepare(`SELECT ${recipeColumns} FROM favorites AS favorite JOIN recipes AS recipe ON recipe.id = favorite.recipe_id LEFT JOIN categories AS category ON category.id = recipe.category_id WHERE favorite.user_id = ? AND recipe.deleted_at IS NULL ORDER BY favorite.created_at DESC`).bind(userId).all<RecipeRow>();
  return hydrate(rows.results ?? [], userId);
}

export async function getD1Categories() {
  const db = await getD1Database();
  const result = await db.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name").all<{ id: string; name: string }>();
  return result.results ?? [];
}

export async function getD1SearchOptions() {
  const db = await getD1Database();
  const [categories, tags, ingredients] = await Promise.all([
    getD1Categories(),
    db.prepare("SELECT name FROM tags WHERE is_active = 1 ORDER BY name").all<{ name: string }>(),
    db.prepare("SELECT DISTINCT name FROM recipe_ingredients ORDER BY name COLLATE NOCASE LIMIT 30").all<{ name: string }>(),
  ]);
  return { categories, tags: (tags.results ?? []).map((row) => row.name), ingredients: (ingredients.results ?? []).map((row) => row.name) };
}

export async function getD1HomeNotices(limit = 3) {
  const db = await getD1Database();
  const result = await db.prepare("SELECT id, title, publish_at, is_pinned FROM notices WHERE status = 'published' AND publish_at IS NOT NULL AND publish_at <= datetime('now') AND (end_at IS NULL OR end_at > datetime('now')) ORDER BY is_pinned DESC, publish_at DESC LIMIT ?").bind(limit).all<{ id: string; title: string; publish_at: string; is_pinned: number }>();
  return result.results ?? [];
}
