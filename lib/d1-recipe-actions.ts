import "server-only";
import type { MutationResult, RecipeInput } from "../app/recipes/actions";
import { parseRecipeQuantity } from "./recipe-editor";
import { getD1Database, isSafeImageKey } from "./d1-bindings";
import { deleteR2Images, moveR2Image } from "./r2-images";

type SaveIntent = "autosave" | "draft" | "publish";
type ValidRecipeInput = Omit<RecipeInput, "servings" | "time" | "calories"> & { servings: number; time: number | ""; calories: number | "" };
type ExistingRecipe = { image_key: string | null; lock_version: number; status: "draft" | "published" | "deleted"; published_at: string | null };
type ExistingStep = { image_key: string | null };
type StagedImage = { staging_key: string; purpose: "recipe" | "recipe_step" | "avatar" };

function stagedKeyFor(userId: string, key: string | null) {
  return Boolean(key && key.startsWith(`${userId}/staging/`) && isSafeImageKey(key));
}

async function getStagedImage(userId: string, key: string, purpose: StagedImage["purpose"]) {
  const db = await getD1Database();
  const row = await db.prepare("SELECT staging_key, purpose FROM image_uploads WHERE staging_key = ? AND owner_user_id = ? AND purpose = ? AND status = 'staged' AND expires_at > datetime('now')")
    .bind(key, userId, purpose).first<StagedImage>();
  return row ?? null;
}

function imageKeysForInput(userId: string, recipeId: string, input: ValidRecipeInput, imageData?: FormData) {
  const coverKey = imageData?.get("staged_image_path");
  const stagedCover = typeof coverKey === "string" && stagedKeyFor(userId, coverKey) ? coverKey : null;
  const stagedSteps = new Map<number, string>();
  for (const step of input.steps) {
    const key = imageData?.get(`step_image_staged_${step.clientId}`);
    if (typeof key === "string" && stagedKeyFor(userId, key)) stagedSteps.set(step.clientId, key);
  }
  return { stagedCover, stagedSteps, recipeId };
}

export async function saveD1Recipe(userId: string, input: ValidRecipeInput, intent: SaveIntent, imageData?: FormData): Promise<MutationResult> {
  const db = await getD1Database();
  const recipeId = input.id ?? input.clientId;
  const savedStatus = intent === "draft" ? "draft" : intent === "publish" ? "published" : input.id ? input.currentStatus : "draft";
  if (intent === "publish" && (!input.title || !input.categoryId || !input.ingredients.length || !input.steps.length)) {
    return { ok: false, error: "公開・非公開で保存するには、レシピ名、カテゴリ、材料、作り方が必要です。" };
  }

  const existing = input.id
    ? await db.prepare("SELECT image_key, lock_version, status, published_at FROM recipes WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL")
      .bind(recipeId, userId).first<ExistingRecipe>()
    : null;
  if (input.id && !existing) return { ok: false, error: "更新対象のレシピが見つかりませんでした。" };
  if (existing && existing.lock_version !== input.lockVersion) return { ok: false, code: "conflict", error: "別の画面でレシピが更新されています。入力内容は保持しています。" };
  if (!input.id) {
    const collision = await db.prepare("SELECT id FROM recipes WHERE id = ?").bind(recipeId).first();
    if (collision) return { ok: false, error: "レシピの保存準備をやり直してください。" };
  }

  const existingSteps = input.id
    ? await db.prepare("SELECT image_key FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).all<ExistingStep>()
    : { results: [] as ExistingStep[] };
  const previousStepKeys = new Set((existingSteps.results ?? []).flatMap((step) => step.image_key ? [step.image_key] : []));
  const { stagedCover, stagedSteps } = imageKeysForInput(userId, recipeId, input, imageData);
  if (imageData?.get("staged_image_path") && !stagedCover) return { ok: false, error: "一時画像の保存先が正しくありません。" };
  if ([...stagedSteps.values()].length !== [...input.steps].filter((step) => imageData?.get(`step_image_staged_${step.clientId}`)).length) return { ok: false, error: "工程写真の一時保存先が正しくありません。" };

  if (stagedCover && !await getStagedImage(userId, stagedCover, "recipe")) return { ok: false, error: "一時保存した画像が見つかりません。もう一度選択してください。" };
  for (const key of stagedSteps.values()) if (!await getStagedImage(userId, key, "recipe_step")) return { ok: false, error: "一時保存した工程写真が見つかりません。もう一度選択してください。" };

  const finalCoverKey = stagedCover ? `${userId}/${recipeId}/${crypto.randomUUID()}.webp` : null;
  const finalStepKeys = new Map<number, string>();
  for (const [clientId] of stagedSteps) finalStepKeys.set(clientId, `${userId}/${recipeId}/steps/${crypto.randomUUID()}.webp`);
  const movedKeys: string[] = [];
  try {
    if (stagedCover && finalCoverKey) { await moveR2Image(stagedCover, finalCoverKey); movedKeys.push(finalCoverKey); }
    for (const [clientId, sourceKey] of stagedSteps) {
      const destinationKey = finalStepKeys.get(clientId)!;
      await moveR2Image(sourceKey, destinationKey); movedKeys.push(destinationKey);
    }
  } catch {
    await deleteR2Images(movedKeys);
    return { ok: false, error: "画像を保存できませんでした。" };
  }

  const now = new Date().toISOString();
  const finalImageKey = finalCoverKey ?? (imageData?.get("remove_image") === "true" ? null : existing?.image_key ?? null);
  const ingredientStatements = input.ingredients.map((ingredient, index) => {
    const quantity = parseRecipeQuantity(ingredient.quantity);
    return db.prepare(`INSERT INTO recipe_ingredients (id, recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), recipeId, ingredient.name, quantity, quantity === null ? null : String(quantity), quantity === null ? ingredient.quantity : null, ingredient.unit === "適量" ? null : ingredient.unit || null, ingredient.note || null, ingredient.group || null, quantity === null ? 0 : 1, index + 1, now);
  });
  const stepStatements = input.steps.map((step, index) => {
    const retained = step.imagePath && previousStepKeys.has(step.imagePath) && step.imagePath.startsWith(`${userId}/${recipeId}/`) ? step.imagePath : null;
    return db.prepare("INSERT INTO recipe_steps (id, recipe_id, instruction, image_key, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), recipeId, step.instruction, finalStepKeys.get(step.clientId) ?? retained, index + 1, now);
  });
  const tags = [...new Set(input.tags.split(/[、,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 10);
  const normalizedTags = tags.map((tag) => ({ name: tag, normalized: tag.toLocaleLowerCase("ja") }));

  try {
    if (input.id) {
      const update = await db.prepare(`UPDATE recipes SET category_id = ?, title = ?, description = ?, base_servings = ?, cooking_time_minutes = ?, calories_per_serving = ?, allergy_notes = ?, visibility = ?, status = ?, image_key = ?, published_at = ?, updated_at = ?, lock_version = lock_version + 1 WHERE id = ? AND owner_user_id = ? AND lock_version = ?`)
        .bind(input.categoryId || null, input.title, input.description || null, Number(input.servings), input.time === "" ? null : Number(input.time), input.calories === "" ? null : Number(input.calories), input.allergy || null, savedStatus === "draft" ? "private" : input.visibility, savedStatus, finalImageKey, savedStatus === "published" ? (existing?.published_at ?? now) : null, now, recipeId, userId, input.lockVersion).run();
      if (!update.meta.changes) {
        await deleteR2Images(movedKeys);
        return { ok: false, code: "conflict", error: "別の画面でレシピが更新されています。入力内容は保持しています。" };
      }
    } else {
      await db.prepare(`INSERT INTO recipes (id, owner_user_id, category_id, title, description, base_servings, cooking_time_minutes, calories_per_serving, allergy_notes, visibility, status, source_type, image_key, published_at, lock_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 1, ?, ?)`)
        .bind(recipeId, userId, input.categoryId || null, input.title, input.description || null, Number(input.servings), input.time === "" ? null : Number(input.time), input.calories === "" ? null : Number(input.calories), input.allergy || null, savedStatus === "draft" ? "private" : input.visibility, savedStatus, finalImageKey, savedStatus === "published" ? now : null, now, now).run();
    }

    const statements = [
      db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(recipeId),
      db.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").bind(recipeId),
      db.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(recipeId),
      ...ingredientStatements,
      ...stepStatements,
      ...normalizedTags.map((tag) => db.prepare("INSERT OR IGNORE INTO tags (id, name, normalized_name, created_by) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), tag.name, tag.normalized, userId)),
    ];
    await db.batch(statements);
    if (normalizedTags.length) {
      const tagRows = await db.prepare(`SELECT id, normalized_name FROM tags WHERE normalized_name IN (${normalizedTags.map(() => "?").join(", ")})`).bind(...normalizedTags.map((tag) => tag.normalized)).all<{ id: string; normalized_name: string }>();
      await db.batch((tagRows.results ?? []).map((tag) => db.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(recipeId, tag.id)));
    }
    const stagedKeys = [stagedCover, ...stagedSteps.values()].filter((key): key is string => Boolean(key));
    if (stagedKeys.length) await db.batch(stagedKeys.map((key, index) => db.prepare("UPDATE image_uploads SET status = 'committed', final_key = ?, committed_at = ? WHERE staging_key = ? AND owner_user_id = ?")
      .bind(index === 0 && finalCoverKey ? finalCoverKey : finalStepKeys.get([...stagedSteps.keys()][Math.max(0, index - (stagedCover ? 1 : 0))]) ?? null, now, key, userId)));
  } catch {
    await deleteR2Images(movedKeys);
    return { ok: false, error: "レシピを保存できませんでした。" };
  }

  const retainedSteps = new Set(input.steps.map((step) => finalStepKeys.get(step.clientId) ?? (step.imagePath && previousStepKeys.has(step.imagePath) ? step.imagePath : null)).filter((key): key is string => Boolean(key)));
  const obsoleteKeys = [...previousStepKeys].filter((key) => !retainedSteps.has(key));
  if (existing?.image_key && existing.image_key !== finalImageKey) obsoleteKeys.push(existing.image_key);
  await deleteR2Images(obsoleteKeys);

  return {
    ok: true,
    id: recipeId,
    lockVersion: (input.id ? input.lockVersion : 0) + 1,
    savedAt: now,
    stepImagePaths: Object.fromEntries(input.steps.map((step) => [String(step.clientId), finalStepKeys.get(step.clientId) ?? (step.imagePath && previousStepKeys.has(step.imagePath) ? step.imagePath : null)])),
  };
}

export async function toggleD1Favorite(userId: string, recipeId: string): Promise<MutationResult> {
  const db = await getD1Database();
  const recipe = await db.prepare("SELECT id FROM recipes WHERE id = ? AND visibility = 'public' AND status = 'published' AND deleted_at IS NULL").bind(recipeId).first();
  if (!recipe) return { ok: false, error: "レシピが見つかりませんでした。" };
  const existing = await db.prepare("SELECT recipe_id FROM favorites WHERE user_id = ? AND recipe_id = ?").bind(userId, recipeId).first();
  if (existing) await db.prepare("DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?").bind(userId, recipeId).run();
  else await db.prepare("INSERT INTO favorites (user_id, recipe_id) VALUES (?, ?)").bind(userId, recipeId).run();
  return { ok: true, active: !existing };
}

export async function copyD1Recipe(userId: string, sourceId: string): Promise<MutationResult> {
  const db = await getD1Database();
  const source = await db.prepare(`SELECT id, owner_user_id, category_id, title, description, base_servings, cooking_time_minutes, calories_per_serving, allergy_notes
    FROM recipes WHERE id = ? AND owner_user_id <> ? AND visibility = 'public' AND status = 'published' AND deleted_at IS NULL`).bind(sourceId, userId)
    .first<{ id: string; owner_user_id: string; category_id: string | null; title: string; description: string | null; base_servings: number; cooking_time_minutes: number | null; calories_per_serving: number | null; allergy_notes: string | null }>();
  if (!source) return { ok: false, error: "コピーできるレシピが見つかりませんでした。" };
  const [ingredients, steps, tags] = await Promise.all([
    db.prepare("SELECT name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order").bind(sourceId).all<Record<string, unknown>>(),
    db.prepare("SELECT instruction, sort_order FROM recipe_steps WHERE recipe_id = ? ORDER BY sort_order").bind(sourceId).all<{ instruction: string; sort_order: number }>(),
    db.prepare("SELECT tag_id FROM recipe_tags WHERE recipe_id = ?").bind(sourceId).all<{ tag_id: string }>(),
  ]);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.prepare(`INSERT INTO recipes (id, owner_user_id, category_id, title, description, base_servings, cooking_time_minutes, calories_per_serving, allergy_notes, visibility, status, source_type, source_recipe_id, source_author_user_id, source_name, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', 'published', 'copied', ?, ?, ?, ?, ?, ?)`)
      .bind(id, userId, source.category_id, source.title, source.description, source.base_servings, source.cooking_time_minutes, source.calories_per_serving, source.allergy_notes, source.id, source.owner_user_id, source.title, now, now, now).run();
    const statements = [
      ...(ingredients.results ?? []).map((item) => db.prepare(`INSERT INTO recipe_ingredients (id, recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, item.name, item.quantity_value, item.quantity_display, item.quantity_text, item.unit, item.note, item.group_name, item.is_scalable, item.sort_order)),
      ...(steps.results ?? []).map((step) => db.prepare("INSERT INTO recipe_steps (id, recipe_id, instruction, sort_order) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, step.instruction, step.sort_order)),
      ...(tags.results ?? []).map((tag) => db.prepare("INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(id, tag.tag_id)),
    ];
    if (statements.length) await db.batch(statements);
    return { ok: true, id };
  } catch {
    await db.prepare("DELETE FROM recipes WHERE id = ? AND owner_user_id = ?").bind(id, userId).run();
    return { ok: false, error: "コピーできませんでした。" };
  }
}

export async function moveD1RecipeToTrash(userId: string, recipeId: string): Promise<MutationResult> {
  const db = await getD1Database();
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.prepare("UPDATE recipes SET trashed_from_status = status, trashed_from_visibility = visibility, status = 'deleted', visibility = 'private', deleted_at = ?, purge_after = ?, updated_at = ?, lock_version = lock_version + 1 WHERE id = ? AND owner_user_id = ? AND status <> 'deleted'")
    .bind(now.toISOString(), purgeAfter, now.toISOString(), recipeId, userId).run();
  return result.meta.changes ? { ok: true } : { ok: false, error: "レシピをゴミ箱へ移せませんでした。" };
}

export async function restoreD1Recipe(userId: string, recipeId: string): Promise<MutationResult> {
  const db = await getD1Database();
  const result = await db.prepare("UPDATE recipes SET status = COALESCE(trashed_from_status, 'draft'), visibility = COALESCE(trashed_from_visibility, 'private'), trashed_from_status = NULL, trashed_from_visibility = NULL, deleted_at = NULL, purge_after = NULL, updated_at = ?, lock_version = lock_version + 1 WHERE id = ? AND owner_user_id = ? AND status = 'deleted' AND purge_after > datetime('now')")
    .bind(new Date().toISOString(), recipeId, userId).run();
  return result.meta.changes ? { ok: true } : { ok: false, error: "復元期限を過ぎているため、レシピを元に戻せませんでした。" };
}

export async function permanentlyDeleteD1Recipe(userId: string, recipeId: string): Promise<MutationResult> {
  const db = await getD1Database();
  const recipe = await db.prepare("SELECT image_key FROM recipes WHERE id = ? AND owner_user_id = ? AND status = 'deleted'").bind(recipeId, userId).first<{ image_key: string | null }>();
  if (!recipe) return { ok: false, error: "削除対象のレシピが見つかりませんでした。" };
  const steps = await db.prepare("SELECT image_key FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).all<ExistingStep>();
  await db.prepare("DELETE FROM recipes WHERE id = ? AND owner_user_id = ? AND status = 'deleted'").bind(recipeId, userId).run();
  await deleteR2Images([recipe.image_key, ...(steps.results ?? []).map((step) => step.image_key)].filter((key): key is string => Boolean(key)));
  return { ok: true };
}
