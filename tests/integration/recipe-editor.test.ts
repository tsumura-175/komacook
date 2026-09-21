import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminTestClient, createAuthenticatedTestClient } from "../helpers/supabase";

describe("recipe editor persistence", () => {
  const recipeIds = new Set<string>();

  beforeEach(() => recipeIds.clear());

  afterEach(async () => {
    if (!recipeIds.size) return;
    const admin = createAdminTestClient();
    await admin.from("recipes").delete().in("id", [...recipeIds]);
  });

  it("未完成下書きを保存し、材料グループ・自由単位・並び順を更新できる", async () => {
    const { client } = await createAuthenticatedTestClient();
    const recipeId = crypto.randomUUID();
    recipeIds.add(recipeId);

    const draft = await client.rpc("save_recipe", {
      recipe_payload: {
        id: recipeId,
        lock_version: "0",
        title: "",
        description: "途中",
        base_servings: "2",
        category_id: "",
        cooking_time_minutes: "",
        calories_per_serving: "",
        allergy_notes: "",
        visibility: "private",
        status: "draft",
        source_type: "manual",
      },
      ingredient_payload: [],
      step_payload: [],
      tag_payload: [],
    });

    expect(draft.error).toBeNull();
    expect(draft.data).toMatchObject({ id: recipeId, lock_version: 1 });
    const storedDraft = await client.from("recipes").select("title,category_id,status,lock_version").eq("id", recipeId).single();
    expect(storedDraft.data).toMatchObject({ title: "", category_id: null, status: "draft", lock_version: 1 });

    const category = await client.from("categories").select("id").eq("is_active", true).order("sort_order").limit(1).single();
    const updated = await client.rpc("save_recipe", {
      recipe_payload: {
        id: recipeId,
        lock_version: "1",
        title: "自家製ソース",
        description: "",
        base_servings: "2",
        category_id: category.data!.id,
        cooking_time_minutes: "10",
        calories_per_serving: "",
        allergy_notes: "",
        visibility: "private",
        status: "draft",
        source_type: "manual",
      },
      ingredient_payload: [
        { name: "こしょう", quantity_value: "", quantity_display: "", quantity_text: "適量", unit: "振り", note: "", group_name: "仕上げ", is_scalable: false, sort_order: 1 },
        { name: "しょうゆ", quantity_value: "2", quantity_display: "2", quantity_text: "", unit: "大さじ", note: "", group_name: "たれ", is_scalable: true, sort_order: 2 },
      ],
      step_payload: [{ instruction: "混ぜる", sort_order: 1 }],
      tag_payload: [],
    });

    expect(updated.error).toBeNull();
    expect(updated.data).toMatchObject({ id: recipeId, lock_version: 2 });
    const ingredients = await client.from("recipe_ingredients").select("name,unit,group_name,sort_order").eq("recipe_id", recipeId).order("sort_order");
    expect(ingredients.data).toEqual([
      { name: "こしょう", unit: "振り", group_name: "仕上げ", sort_order: 1 },
      { name: "しょうゆ", unit: "大さじ", group_name: "たれ", sort_order: 2 },
    ]);

    const conflict = await client.rpc("save_recipe", {
      recipe_payload: {
        id: recipeId,
        lock_version: "1",
        title: "古い画面の内容",
        description: "",
        base_servings: "2",
        category_id: category.data!.id,
        cooking_time_minutes: "",
        calories_per_serving: "",
        allergy_notes: "",
        visibility: "private",
        status: "draft",
        source_type: "manual",
      },
      ingredient_payload: [],
      step_payload: [],
      tag_payload: [],
    });
    expect(conflict.error?.code).toBe("40001");
    expect(conflict.error?.message).toContain("recipe_conflict");
  });
});
