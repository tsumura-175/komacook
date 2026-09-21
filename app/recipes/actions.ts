"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRecipeQuantity } from "../../lib/recipe-editor";
import { normalizeRecipeImage, normalizeRecipeStepImage } from "../../lib/recipe-image";
import { createClient } from "../../lib/supabase/server";

export type IngredientInput = { name: string; quantity: string; unit: string; note: string; group: string };
export type RecipeStepInput = { clientId: number; instruction: string; imagePath?: string | null };
export type RecipeInput = {
  id?: string;
  clientId: string;
  lockVersion: number;
  currentStatus: "draft" | "published";
  title: string;
  description: string;
  servings: string;
  categoryId: string;
  time: string;
  calories: string;
  tags: string;
  visibility: "public" | "private";
  allergy: string;
  ingredients: IngredientInput[];
  steps: RecipeStepInput[];
};
export type MutationResult = { ok: boolean; error?: string; code?: "conflict"; id?: string; active?: boolean; lockVersion?: number; savedAt?: string; stepImagePaths?: Record<string, string | null> };

const postgresUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const recipeSchema = z.object({
  id: postgresUuid.optional(),
  clientId: postgresUuid,
  lockVersion: z.number().int().min(0),
  currentStatus: z.enum(["draft", "published"]),
  title: z.string().trim().max(100),
  description: z.string().trim().max(3000),
  servings: z.coerce.number().positive().max(100),
  categoryId: z.union([z.literal(""), postgresUuid]),
  time: z.union([z.literal(""), z.coerce.number().int().min(1).max(1440)]),
  calories: z.union([z.literal(""), z.coerce.number().int().min(0).max(10000)]),
  tags: z.string(),
  visibility: z.enum(["public", "private"]),
  allergy: z.string().trim().max(2000),
  ingredients: z.array(z.object({ name: z.string().trim().min(1).max(100), quantity: z.string().trim().min(1).max(30), unit: z.string().trim().max(30), note: z.string().trim().max(200), group: z.string().trim().max(50) })),
  steps: z.array(z.object({ clientId: z.number().int().positive(), instruction: z.string().trim().min(1).max(2000), imagePath: z.string().max(500).nullable().optional() })),
});
const imageCropSchema = z.object({
  zoom: z.coerce.number().min(1).max(3),
  positionX: z.coerce.number().min(0).max(100),
  positionY: z.coerce.number().min(0).max(100),
});

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

function refreshRecipePages(recipeId?: string) {
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath("/mypage");
  revalidatePath("/mypage/recipes");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);
}

export async function saveRecipe(input: RecipeInput, intent: "autosave" | "draft" | "publish", imageData?: FormData): Promise<MutationResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "必須項目、材料、作り方の入力内容を確認してください。" };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "ログインが必要です。" };
  const values = parsed.data;
  const savedStatus = intent === "draft" ? "draft" : intent === "publish" ? "published" : values.id ? values.currentStatus : "draft";
  if (intent === "publish" && (!values.title || !values.categoryId || !values.ingredients.length || !values.steps.length)) {
    return { ok: false, error: "公開・非公開で保存するには、レシピ名、カテゴリ、材料、作り方が必要です。" };
  }
  const stagedImagePathValue = imageData?.get("staged_image_path");
  const stagedImagePath = typeof stagedImagePathValue === "string" && stagedImagePathValue ? stagedImagePathValue : null;
  const removeImage = imageData?.get("remove_image") === "true";
  let normalizedImage: ArrayBuffer | null = null;

  if (stagedImagePath) {
    const ownedStagingPrefix = `${user.id}/staging/`;
    if (!stagedImagePath.startsWith(ownedStagingPrefix) || !/^[0-9a-f-]{36}\.webp$/i.test(stagedImagePath.slice(ownedStagingPrefix.length))) {
      return { ok: false, error: "一時画像の保存先が正しくありません。" };
    }
    const crop = imageCropSchema.safeParse({
      zoom: imageData?.get("image_crop_zoom"),
      positionX: imageData?.get("image_crop_x"),
      positionY: imageData?.get("image_crop_y"),
    });
    if (!crop.success) {
      await supabase.storage.from("recipe-images").remove([stagedImagePath]);
      return { ok: false, error: "画像の切り抜き設定を確認してください。" };
    }
    const { data: stagedImage, error: downloadError } = await supabase.storage.from("recipe-images").download(stagedImagePath);
    if (downloadError || !stagedImage) {
      await supabase.storage.from("recipe-images").remove([stagedImagePath]);
      return { ok: false, error: "一時保存した画像を読み込めませんでした。" };
    }
    try {
      normalizedImage = await normalizeRecipeImage(stagedImage, crop.data);
    } catch {
      await supabase.storage.from("recipe-images").remove([stagedImagePath]);
      return { ok: false, error: "画像を読み取れませんでした。JPEG・PNG・WebP形式、10MB以下の画像を選んでください。" };
    }
    const { error: stagingCleanupError } = await supabase.storage.from("recipe-images").remove([stagedImagePath]);
    if (stagingCleanupError) return { ok: false, error: "一時保存した原画像を削除できなかったため、保存を中止しました。" };
  }

  const targetId = values.id ?? values.clientId;
  const previousImagePromise = values.id
    ? supabase.from("recipes").select("image_path, recipe_steps(image_path)").eq("id", targetId).eq("owner_user_id", user.id).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const tags = [...new Set(values.tags.split(/[、,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 10);
  const ingredients = values.ingredients.map((ingredient, index) => {
    const quantityValue = parseRecipeQuantity(ingredient.quantity);
    return {
      name: ingredient.name,
      quantity_value: quantityValue === null ? "" : String(quantityValue),
      quantity_display: quantityValue === null ? "" : ingredient.quantity,
      quantity_text: quantityValue === null ? ingredient.quantity : "",
      unit: ingredient.unit === "適量" ? "" : ingredient.unit,
      note: ingredient.note,
      group_name: ingredient.group,
      is_scalable: quantityValue !== null,
      sort_order: index + 1,
    };
  });
  const previousImageResult = await previousImagePromise;
  if (previousImageResult.error) return { ok: false, error: "現在の画像情報を確認できませんでした。" };
  const previousStepPaths = new Set((previousImageResult.data?.recipe_steps ?? []).flatMap((step) => step.image_path ? [step.image_path] : []));
  const stagedStepImages = new Map<number, ArrayBuffer>();
  const stagedStepPaths: string[] = [];
  for (const step of values.steps) {
    const stagedPathValue = imageData?.get(`step_image_staged_${step.clientId}`);
    if (!stagedPathValue) continue;
    if (typeof stagedPathValue !== "string") return { ok: false, error: "工程写真の一時保存先が正しくありません。" };
    const prefix = `${user.id}/staging/`;
    if (!stagedPathValue.startsWith(prefix) || !/^[0-9a-f-]{36}\.webp$/i.test(stagedPathValue.slice(prefix.length))) return { ok: false, error: "工程写真の一時保存先が正しくありません。" };
    stagedStepPaths.push(stagedPathValue);
    const { data: source, error: sourceError } = await supabase.storage.from("recipe-images").download(stagedPathValue);
    if (sourceError || !source) { await supabase.storage.from("recipe-images").remove(stagedStepPaths); return { ok: false, error: "一時保存した工程写真を読み込めませんでした。" }; }
    try { stagedStepImages.set(step.clientId, await normalizeRecipeStepImage(source)); }
    catch { await supabase.storage.from("recipe-images").remove(stagedStepPaths); return { ok: false, error: "工程写真を読み取れませんでした。JPEG・PNG・WebP形式、10MB以下の画像を選んでください。" }; }
  }
  if (stagedStepPaths.length) await supabase.storage.from("recipe-images").remove(stagedStepPaths);
  const finalStepPaths = new Map<number, string>();
  const uploadedStepPaths: string[] = [];
  for (const [clientId, image] of stagedStepImages) {
    const path = `${user.id}/${targetId}/steps/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from("recipe-images").upload(path, image, { contentType: "image/webp", upsert: false });
    if (uploadError) { await supabase.storage.from("recipe-images").remove(uploadedStepPaths); return { ok: false, error: "工程写真を保存できませんでした。" }; }
    uploadedStepPaths.push(path); finalStepPaths.set(clientId, path);
  }
  const stepPayload = values.steps.map((step, index) => {
    const existingPath = step.imagePath && previousStepPaths.has(step.imagePath) ? step.imagePath : null;
    return { instruction: step.instruction, sort_order: index + 1, image_path: finalStepPaths.get(step.clientId) ?? existingPath };
  });
  const { data, error } = await supabase.rpc("save_recipe", {
    recipe_payload: {
      id: targetId,
      lock_version: String(values.lockVersion),
      title: values.title,
      description: values.description,
      base_servings: String(values.servings),
      category_id: values.categoryId,
      cooking_time_minutes: values.time === "" ? "" : String(values.time),
      calories_per_serving: values.calories === "" ? "" : String(values.calories),
      allergy_notes: values.allergy,
      visibility: savedStatus === "draft" ? "private" : values.visibility,
      status: savedStatus,
      source_type: "manual",
    },
    ingredient_payload: ingredients,
    step_payload: stepPayload,
    tag_payload: tags,
  });
  if (error || !data) {
    if (uploadedStepPaths.length) await supabase.storage.from("recipe-images").remove(uploadedStepPaths);
    if (error?.code === "40001" || error?.message.includes("recipe_conflict")) {
      return { ok: false, code: "conflict", error: "別の画面でレシピが更新されています。入力内容は保持しています。" };
    }
    return { ok: false, error: error?.message ?? "レシピを保存できませんでした。" };
  }
  const saveData = data as { id?: string; lock_version?: number; updated_at?: string };
  const recipeId = String(saveData.id ?? targetId);
  const lockVersion = Number(saveData.lock_version ?? values.lockVersion + 1);
  const savedAt = String(saveData.updated_at ?? new Date().toISOString());
  const previousImagePath = previousImageResult.data?.image_path ?? null;
  const retainedStepPaths = new Set(stepPayload.flatMap((step) => step.image_path ? [step.image_path] : []));
  const obsoleteStepPaths = [...previousStepPaths].filter((path) => !retainedStepPaths.has(path));
  if (obsoleteStepPaths.length) {
    const { error: cleanupError } = await supabase.storage.from("recipe-images").remove(obsoleteStepPaths);
    if (cleanupError) return { ok: false, id: recipeId, lockVersion, savedAt, error: "レシピは保存しましたが、以前の工程写真を削除できませんでした。" };
  }

  if (normalizedImage) {
    const imagePath = `${user.id}/${recipeId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from("recipe-images").upload(imagePath, normalizedImage, { contentType: "image/webp", upsert: false });
    if (uploadError) return { ok: false, id: recipeId, lockVersion, savedAt, error: "レシピは保存しましたが、画像を保存できませんでした。" };
    const { error: updateError } = await supabase.from("recipes").update({ image_path: imagePath }).eq("id", recipeId).eq("owner_user_id", user.id);
    if (updateError) {
      await supabase.storage.from("recipe-images").remove([imagePath]);
      return { ok: false, id: recipeId, lockVersion, savedAt, error: "画像の関連付けに失敗したため、アップロードした画像を破棄しました。" };
    }
    if (previousImagePath && previousImagePath !== imagePath) {
      const { error: cleanupError } = await supabase.storage.from("recipe-images").remove([previousImagePath]);
      if (cleanupError) {
        await Promise.all([
          supabase.from("recipes").update({ image_path: previousImagePath }).eq("id", recipeId).eq("owner_user_id", user.id),
          supabase.storage.from("recipe-images").remove([imagePath]),
        ]);
        return { ok: false, id: recipeId, lockVersion, savedAt, error: "以前の画像を削除できなかったため、画像の変更を取り消しました。" };
      }
    }
  } else if (removeImage && previousImagePath) {
    const { error: updateError } = await supabase.from("recipes").update({ image_path: null }).eq("id", recipeId).eq("owner_user_id", user.id);
    if (updateError) return { ok: false, id: recipeId, error: "画像を削除できませんでした。" };
    const { error: cleanupError } = await supabase.storage.from("recipe-images").remove([previousImagePath]);
    if (cleanupError) {
      await supabase.from("recipes").update({ image_path: previousImagePath }).eq("id", recipeId).eq("owner_user_id", user.id);
      return { ok: false, id: recipeId, error: "画像ファイルを削除できなかったため、削除操作を取り消しました。" };
    }
  }

  refreshRecipePages(recipeId);
  return { ok: true, id: recipeId, lockVersion, savedAt, stepImagePaths: Object.fromEntries(values.steps.map((step, index) => [String(step.clientId), stepPayload[index]?.image_path ?? null])) };
}

export async function toggleFavorite(recipeId: string): Promise<MutationResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "login_required" };
  const { data: existing } = await supabase.from("favorites").select("recipe_id").eq("user_id", user.id).eq("recipe_id", recipeId).maybeSingle();
  const result = existing
    ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("recipe_id", recipeId)
    : await supabase.from("favorites").insert({ user_id: user.id, recipe_id: recipeId });
  if (result.error) return { ok: false, error: result.error.message };
  refreshRecipePages(recipeId);
  return { ok: true, active: !existing };
}

export async function copyRecipe(recipeId: string): Promise<MutationResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "login_required" };
  const { data, error } = await supabase.rpc("copy_recipe", { source_id: recipeId });
  if (error || !data) return { ok: false, error: error?.message ?? "コピーできませんでした。" };
  refreshRecipePages(String(data));
  return { ok: true, id: String(data) };
}

export async function moveRecipeToTrash(recipeId: string): Promise<MutationResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "login_required" };
  const { data, error } = await supabase.rpc("move_recipe_to_trash", { target_id: recipeId });
  if (error || !data) return { ok: false, error: error?.message ?? "レシピをゴミ箱へ移せませんでした。" };
  refreshRecipePages(recipeId);
  return { ok: true };
}

export async function restoreRecipe(recipeId: string): Promise<MutationResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "login_required" };
  const { data, error } = await supabase.rpc("restore_recipe", { target_id: recipeId });
  if (error || !data) return { ok: false, error: error?.message ?? "復元期限を過ぎているため、レシピを元に戻せませんでした。" };
  refreshRecipePages(recipeId);
  return { ok: true };
}

export async function permanentlyDeleteRecipe(recipeId: string): Promise<MutationResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "login_required" };
  const { data: recipe, error: lookupError } = await supabase.from("recipes").select("image_path, recipe_steps(image_path)").eq("id", recipeId).eq("owner_user_id", user.id).eq("status", "deleted").maybeSingle();
  if (lookupError || !recipe) return { ok: false, error: lookupError?.message ?? "削除対象のレシピが見つかりませんでした。" };
  const imagePaths = [recipe.image_path, ...(recipe.recipe_steps ?? []).map((step) => step.image_path)].filter((path): path is string => Boolean(path));
  if (recipe.image_path) {
    const { error: detachError } = await supabase.from("recipes").update({ image_path: null }).eq("id", recipeId).eq("owner_user_id", user.id).eq("status", "deleted");
    if (detachError) return { ok: false, error: "完成画像の削除準備に失敗しました。" };
    const { error: imageError } = await supabase.storage.from("recipe-images").remove([recipe.image_path]);
    if (imageError) {
      await supabase.from("recipes").update({ image_path: recipe.image_path }).eq("id", recipeId).eq("owner_user_id", user.id).eq("status", "deleted");
      return { ok: false, error: "完成画像を削除できなかったため、完全削除を中止しました。" };
    }
  }
  if (imagePaths.length > (recipe.image_path ? 1 : 0)) {
    const { error: imageError } = await supabase.storage.from("recipe-images").remove(imagePaths.filter((path) => path !== recipe.image_path));
    if (imageError) return { ok: false, error: "工程写真を削除できなかったため、完全削除を中止しました。" };
  }
  const { data: deletedRecipe, error } = await supabase.from("recipes").delete().eq("id", recipeId).eq("owner_user_id", user.id).eq("status", "deleted").select("id").maybeSingle();
  if (error || !deletedRecipe) return { ok: false, error: error?.message ?? "レシピを完全削除できませんでした。" };
  refreshRecipePages();
  return { ok: true };
}
