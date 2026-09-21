import { NextRequest, NextResponse } from "next/server";
import { deleteAccountData, deleteClaimedRecipe } from "../../../../lib/maintenance";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: contactRateLimitsDeleted, error: contactLimitCleanupError } = await supabase.rpc("cleanup_contact_rate_limits");
  if (contactLimitCleanupError) return NextResponse.json({ error: contactLimitCleanupError.message }, { status: 500 });
  const { data: staleStagingObjects, error: stagingListError } = await supabase.rpc("list_stale_recipe_image_staging", { batch_size: 500 });
  if (stagingListError) return NextResponse.json({ error: stagingListError.message }, { status: 500 });
  const staleStagingPaths = (staleStagingObjects ?? []).map((item: { object_name: string }) => item.object_name);
  if (staleStagingPaths.length) {
    const { error: stagingCleanupError } = await supabase.storage.from("recipe-images").remove(staleStagingPaths);
    if (stagingCleanupError) return NextResponse.json({ error: stagingCleanupError.message }, { status: 500 });
  }

  const { data: dueRecipes, error: recipeClaimError } = await supabase.rpc("claim_due_recipe_deletions", { batch_size: 100 });
  if (recipeClaimError) return NextResponse.json({ error: recipeClaimError.message }, { status: 500 });
  const recipeResults: Array<{ recipeId: string; status: "deleted" | "failed"; error?: string }> = [];
  for (const item of dueRecipes ?? []) {
    const recipeId = item.recipe_id as string;
    try {
      await deleteClaimedRecipe(supabase, { recipe_id: recipeId, image_path: item.image_path as string | null });
      recipeResults.push({ recipeId, status: "deleted" });
    } catch (error) {
      const message = errorMessage(error, "レシピの完全削除に失敗しました。");
      await supabase.from("recipes").update({ purge_claimed_at: null, purge_last_error: message }).eq("id", recipeId).eq("status", "deleted");
      recipeResults.push({ recipeId, status: "failed", error: message });
    }
  }

  const { data: requests, error: claimError } = await supabase.rpc("claim_due_account_deletions", { batch_size: 25 });
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });

  const results: Array<{ userId: string; status: "deleted" | "failed"; error?: string }> = [];
  for (const item of requests ?? []) {
    const userId = item.user_id as string;
    try {
      await deleteAccountData(supabase, userId);
      results.push({ userId, status: "deleted" });
    } catch (error) {
      const message = errorMessage(error, "退会データの削除に失敗しました。");
      await supabase.from("account_deletion_requests").update({ status: "failed", last_error: message }).eq("user_id", userId);
      results.push({ userId, status: "failed", error: message });
    }
  }
  return NextResponse.json({
    staleRecipeImagesDeleted: staleStagingPaths.length,
    contactRateLimitsDeleted: contactRateLimitsDeleted ?? 0,
    recipesProcessed: recipeResults.length,
    recipesDeleted: recipeResults.filter((item) => item.status === "deleted").length,
    recipesFailed: recipeResults.filter((item) => item.status === "failed").length,
    recipeResults,
    processed: results.length,
    deleted: results.filter((item) => item.status === "deleted").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
