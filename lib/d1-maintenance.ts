import "server-only";
import { createAdminClient } from "./supabase/admin";
import { deleteR2Images } from "./r2-images";
import { getD1Database } from "./d1-bindings";

type ImageRow = { image_key: string | null };

async function deleteD1Recipe(recipeId: string) {
  const db = await getD1Database();
  const [recipe, steps] = await Promise.all([
    db.prepare("SELECT image_key FROM recipes WHERE id = ? AND status = 'deleted'").bind(recipeId).first<ImageRow>(),
    db.prepare("SELECT image_key FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).all<ImageRow>(),
  ]);
  if (!recipe) return false;
  await db.prepare("DELETE FROM recipes WHERE id = ? AND status = 'deleted'").bind(recipeId).run();
  await deleteR2Images([recipe.image_key, ...(steps.results ?? []).map((step) => step.image_key)].filter((key): key is string => Boolean(key)));
  return true;
}

async function deleteD1Account(userId: string) {
  const db = await getD1Database();
  const [profile, recipes] = await Promise.all([
    db.prepare("SELECT avatar_key FROM profiles WHERE user_id = ?").bind(userId).first<{ avatar_key: string | null }>(),
    db.prepare("SELECT id, visibility, image_key FROM recipes WHERE owner_user_id = ?").bind(userId).all<{ id: string; visibility: "public" | "private"; image_key: string | null }>(),
  ]);
  const privateRecipes = (recipes.results ?? []).filter((recipe) => recipe.visibility === "private");
  const privateIds = privateRecipes.map((recipe) => recipe.id);
  const privateStepKeys = privateIds.length ? (await db.prepare(`SELECT image_key FROM recipe_steps WHERE recipe_id IN (${privateIds.map(() => "?").join(", ")})`).bind(...privateIds).all<ImageRow>()).results ?? [] : [];
  if (privateIds.length) await db.batch(privateIds.map((id) => db.prepare("DELETE FROM recipes WHERE id = ? AND owner_user_id = ?").bind(id, userId)));
  await db.batch([
    db.prepare("UPDATE recipes SET owner_user_id = NULL, source_author_user_id = NULL, updated_at = ? WHERE owner_user_id = ? AND visibility = 'public'").bind(new Date().toISOString(), userId),
    db.prepare("DELETE FROM profiles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_consents WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_notifications WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM favorites WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM contact_logs WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM notice_reads WHERE user_id = ?").bind(userId),
  ]);
  await deleteR2Images([profile?.avatar_key ?? null, ...privateRecipes.map((recipe) => recipe.image_key), ...privateStepKeys.map((step) => step.image_key)].filter((key): key is string => Boolean(key)));
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function runD1Maintenance() {
  const db = await getD1Database();
  const [staging, dueRecipes, dueAccounts] = await Promise.all([
    db.prepare("SELECT staging_key FROM image_uploads WHERE status = 'staged' AND expires_at <= datetime('now') LIMIT 500").all<{ staging_key: string }>(),
    db.prepare("SELECT id FROM recipes WHERE status = 'deleted' AND purge_after <= datetime('now') AND (purge_claimed_at IS NULL OR purge_claimed_at < datetime('now', '-1 hour')) LIMIT 100").all<{ id: string }>(),
    db.prepare("SELECT user_id FROM account_deletion_requests WHERE status IN ('pending', 'failed') AND delete_after <= datetime('now') LIMIT 25").all<{ user_id: string }>(),
  ]);
  const stale = staging.results ?? [];
  if (stale.length) {
    await deleteR2Images(stale.map((item) => item.staging_key));
    await db.batch(stale.map((item) => db.prepare("UPDATE image_uploads SET status = 'discarded' WHERE staging_key = ? AND status = 'staged'").bind(item.staging_key)));
  }
  await db.prepare("DELETE FROM contact_rate_limits WHERE window_started_at < datetime('now', '-1 day')").run();
  const recipeResults: Array<{ recipeId: string; status: "deleted" | "failed"; error?: string }> = [];
  for (const item of dueRecipes.results ?? []) {
    try { recipeResults.push({ recipeId: item.id, status: await deleteD1Recipe(item.id) ? "deleted" : "failed" }); }
    catch (error) { const message = error instanceof Error ? error.message.slice(0, 300) : "レシピの完全削除に失敗しました。"; await db.prepare("UPDATE recipes SET purge_last_error = ?, purge_claimed_at = NULL WHERE id = ?").bind(message, item.id).run(); recipeResults.push({ recipeId: item.id, status: "failed", error: message }); }
  }
  const accountResults: Array<{ userId: string; status: "deleted" | "failed"; error?: string }> = [];
  for (const item of dueAccounts.results ?? []) {
    await db.prepare("UPDATE account_deletion_requests SET status = 'processing', last_error = NULL WHERE user_id = ?").bind(item.user_id).run();
    try {
      await deleteD1Account(item.user_id);
      await db.prepare("UPDATE account_deletion_requests SET status = 'completed', completed_at = ? WHERE user_id = ?").bind(new Date().toISOString(), item.user_id).run();
      accountResults.push({ userId: item.user_id, status: "deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "退会データの削除に失敗しました。";
      await db.prepare("UPDATE account_deletion_requests SET status = 'failed', last_error = ? WHERE user_id = ?").bind(message, item.user_id).run();
      accountResults.push({ userId: item.user_id, status: "failed", error: message });
    }
  }
  return { staleRecipeImagesDeleted: stale.length, recipesProcessed: recipeResults.length, recipesDeleted: recipeResults.filter((item) => item.status === "deleted").length, recipesFailed: recipeResults.filter((item) => item.status === "failed").length, recipeResults, processed: accountResults.length, deleted: accountResults.filter((item) => item.status === "deleted").length, failed: accountResults.filter((item) => item.status === "failed").length, results: accountResults };
}
