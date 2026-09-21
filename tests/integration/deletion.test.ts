import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { deleteAccountData, deleteClaimedRecipe } from "../../lib/maintenance";
import { createAdminTestClient, createAnonymousTestClient, createAuthenticatedTestClient } from "../helpers/supabase";

describe("削除処理", () => {
  const admin = createAdminTestClient();
  const cleanupRecipeIds = new Set<string>();
  const cleanupImagePaths = new Set<string>();
  const cleanupAvatarPaths = new Set<string>();
  const cleanupUserIds = new Set<string>();

  afterEach(async () => {
    if (cleanupImagePaths.size) await admin.storage.from("recipe-images").remove([...cleanupImagePaths]);
    if (cleanupAvatarPaths.size) await admin.storage.from("avatars").remove([...cleanupAvatarPaths]);
    for (const id of cleanupRecipeIds) await admin.from("recipes").delete().eq("id", id);
    for (const id of cleanupUserIds) await admin.auth.admin.deleteUser(id);
    cleanupImagePaths.clear();
    cleanupAvatarPaths.clear();
    cleanupRecipeIds.clear();
    cleanupUserIds.clear();
  });

  it("下書きの復元先を保持し、完全削除時に完成画像と工程写真も削除する", async () => {
    const { client, user } = await createAuthenticatedTestClient();
    const recipeId = randomUUID();
    const imagePath = `${user.id}/${recipeId}/${randomUUID()}.webp`;
    const stepImagePath = `${user.id}/${recipeId}/steps/${randomUUID()}.webp`;
    cleanupRecipeIds.add(recipeId);
    cleanupImagePaths.add(imagePath);
    cleanupImagePaths.add(stepImagePath);

    const category = await client.from("categories").select("id").eq("is_active", true).order("sort_order").limit(1).single();
    expect(category.error).toBeNull();
    const inserted = await client.from("recipes").insert({
      id: recipeId,
      owner_user_id: user.id,
      category_id: category.data!.id,
      title: `__test__delete_${recipeId}`,
      base_servings: 2,
      visibility: "private",
      status: "draft",
      source_type: "manual",
    });
    expect(inserted.error).toBeNull();

    const image = await sharp({ create: { width: 40, height: 25, channels: 3, background: "#c46a4a" } }).webp().toBuffer();
    const uploaded = await client.storage.from("recipe-images").upload(imagePath, image, { contentType: "image/webp" });
    expect(uploaded.error).toBeNull();
    const linked = await client.from("recipes").update({ image_path: imagePath }).eq("id", recipeId);
    expect(linked.error).toBeNull();
    expect((await client.storage.from("recipe-images").upload(stepImagePath, image, { contentType: "image/webp" })).error).toBeNull();
    expect((await client.from("recipe_steps").insert({ recipe_id: recipeId, instruction: "工程写真付き", sort_order: 1, image_path: stepImagePath })).error).toBeNull();

    const moved = await client.rpc("move_recipe_to_trash", { target_id: recipeId });
    expect(moved.error).toBeNull();
    expect(moved.data).toBe(true);
    const trashed = await client.from("recipes").select("status, trashed_from_status").eq("id", recipeId).single();
    expect(trashed.data).toEqual({ status: "deleted", trashed_from_status: "draft" });

    const restored = await client.rpc("restore_recipe", { target_id: recipeId });
    expect(restored.error).toBeNull();
    expect(restored.data).toBe(true);
    const restoredRecipe = await client.from("recipes").select("status, trashed_from_status").eq("id", recipeId).single();
    expect(restoredRecipe.data).toEqual({ status: "draft", trashed_from_status: null });

    expect((await client.rpc("move_recipe_to_trash", { target_id: recipeId })).data).toBe(true);
    await deleteClaimedRecipe(admin, { recipe_id: recipeId, image_path: imagePath });
    cleanupRecipeIds.delete(recipeId);
    cleanupImagePaths.delete(imagePath);
    cleanupImagePaths.delete(stepImagePath);

    const recipeAfterDelete = await admin.from("recipes").select("id").eq("id", recipeId).maybeSingle();
    expect(recipeAfterDelete.error).toBeNull();
    expect(recipeAfterDelete.data).toBeNull();
    const imageAfterDelete = await admin.storage.from("recipe-images").download(imagePath);
    expect(imageAfterDelete.error).not.toBeNull();
    expect((await admin.storage.from("recipe-images").download(stepImagePath)).error).not.toBeNull();
  });

  it("退会削除で私有データを消し、公開レシピを匿名化する", async () => {
    const email = `regression-${randomUUID()}@komacook.local`;
    const password = `Test!${randomUUID()}Aa1`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    cleanupUserIds.add(userId);

    const member = createAnonymousTestClient();
    expect((await member.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboarding = await member.rpc("complete_onboarding", {
      p_display_name: "回帰テスト会員",
      p_standard_servings: 2,
      p_family_adults: 1,
      p_family_children: 0,
      p_show_family: false,
      p_avatar_kind: "preset",
      p_preset_avatar_key: "utensils",
      p_avatar_color: "coral",
      p_avatar_path: null,
    });
    expect(onboarding.error).toBeNull();
    expect(onboarding.data).toBe(true);

    const category = await member.from("categories").select("id").eq("is_active", true).order("sort_order").limit(1).single();
    const privateRecipeId = randomUUID();
    const publicRecipeId = randomUUID();
    const privateImagePath = `${userId}/${privateRecipeId}/${randomUUID()}.webp`;
    const avatarPath = `${userId}/${randomUUID()}.webp`;
    cleanupRecipeIds.add(privateRecipeId);
    cleanupRecipeIds.add(publicRecipeId);
    cleanupImagePaths.add(privateImagePath);
    cleanupAvatarPaths.add(avatarPath);
    const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#6f8f65" } }).webp().toBuffer();
    expect((await member.storage.from("recipe-images").upload(privateImagePath, image, { contentType: "image/webp" })).error).toBeNull();
    expect((await member.storage.from("avatars").upload(avatarPath, image, { contentType: "image/webp" })).error).toBeNull();
    expect((await member.from("profiles").update({ avatar_kind: "upload", avatar_path: avatarPath }).eq("user_id", userId)).error).toBeNull();
    expect((await member.from("recipes").insert([
      { id: privateRecipeId, owner_user_id: userId, category_id: category.data!.id, title: `__test__private_${privateRecipeId}`, base_servings: 2, visibility: "private", status: "published", source_type: "manual", image_path: privateImagePath },
      { id: publicRecipeId, owner_user_id: userId, category_id: category.data!.id, title: `__test__public_${publicRecipeId}`, base_servings: 2, visibility: "public", status: "published", source_type: "manual" },
    ])).error).toBeNull();

    await deleteAccountData(admin, userId);
    cleanupUserIds.delete(userId);
    cleanupRecipeIds.delete(privateRecipeId);
    cleanupImagePaths.delete(privateImagePath);
    cleanupAvatarPaths.delete(avatarPath);

    const authUser = await admin.auth.admin.getUserById(userId);
    expect(authUser.error).not.toBeNull();
    const profile = await admin.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    expect(profile.error).toBeNull();
    expect(profile.data).toBeNull();
    expect((await admin.from("recipes").select("id").eq("id", privateRecipeId).maybeSingle()).data).toBeNull();
    const publicRecipe = await admin.from("recipes").select("owner_user_id, visibility").eq("id", publicRecipeId).single();
    expect(publicRecipe.data).toEqual({ owner_user_id: null, visibility: "public" });
    expect((await admin.storage.from("recipe-images").download(privateImagePath)).error).not.toBeNull();
    expect((await admin.storage.from("avatars").download(avatarPath)).error).not.toBeNull();
  });
});
